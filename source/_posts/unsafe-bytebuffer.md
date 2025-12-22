---
title: Unsafe与ByteBuffer那些事
toc: true
type: 1
date: 2021-10-19 19:00:24
categories:
- Java
tags:
- NIO
---

上一篇文章《聊聊Unsafe的一些使用技巧》写作之后，阅读量很快超过了 1500，Kirito 在这里感谢大家的阅读啦，所以我又来更新了。如果你还没有阅读上一篇文章，我建议你先去看下，闲话不多说，开始今天的话题。

无论是日常开发还是竞赛，Unsafe 不常有而 ByteBuffer 常有，只介绍 Unsafe，让我的博文显得很“炫技”，为了证明“Kirito的技术分享”它可是一个正经的公众号，所以这篇文章会说到另一个比较贴地气的主角 ByteBuffer。我会把我这么多年打比赛的经验传授给你，只求你的一个三连。

## 从 DirectBuffer 的构造器说起

书接上文，我提到过 DirectBuffer 开辟的堆外内存其实就是通过 Unsafe 分配的，但没有详细介绍，今天就给他补上。看一眼 DirectBuffer 的构造函数

```java
    DirectByteBuffer(int cap) {                   // package-private
        super(-1, 0, cap, cap);
        boolean pa = VM.isDirectMemoryPageAligned();
        int ps = Bits.pageSize();
        long size = Math.max(1L, (long)cap + (pa ? ps : 0));
        Bits.reserveMemory(size, cap);
        long base = 0;
        try {
            base = unsafe.allocateMemory(size);
        } catch (OutOfMemoryError x) {
            Bits.unreserveMemory(size, cap);
            throw x;
        }
        unsafe.setMemory(base, size, (byte) 0);
        if (pa && (base % ps != 0)) {
            // Round up to page boundary
            address = base + ps - (base & (ps - 1));
        } else {
            address = base;
        }
        cleaner = Cleaner.create(this, new Deallocator(base, size, cap));
        att = null;
    }
```

短短的十几行代码，蕴含了非常大的信息量，先说关键点

- `long base = unsafe.allocateMemory(size); `调用 Unsafe 分配内存，返回内存首地址
- `unsafe.setMemory(base, size, (byte) 0); ` 初始化内存为 0。这一行我们放在下节做重点介绍。
- `Cleaner.create(this, new Deallocator(base, size, cap));` 设置堆外内存的回收器，不详细介绍了，可以参考我之前的文章《[一文探讨堆外内存的监控与回收](https://www.cnkirito.moe/nio-buffer-recycle/)》。

仅构造器中的这一幕，便让 Unsafe 和 ByteBuffer 产生了千丝万缕的关联，发挥想象力的话，可以把 ByteBuffer 看做是 Unsafe 一系列内存操作 API 的 safe 版本。而安全一定有代价，在编程领域，一般都有一个常识，越是接近底层的事物，控制力越强，性能越好；越接近用户的事物，更易操作，但性能会差强人意。ByteBuffer 封装的 limit/position/capacity 等概念，用熟悉了之后我觉得比 Netty 后封装 的 ByteBuf 还要简便，但即使优秀如它，仍然有被人嫌弃的一面：大量的边界检查。

一个最吸引性能挑战赛选手去使用 Unsafe 操作内存，而不是 ByteBuffer 地方，便是边界检查。如示例代码一：

```java
public ByteBuffer put(byte[] src, int offset, int length) {
    if (((long)length << 0) > Bits.JNI_COPY_FROM_ARRAY_THRESHOLD) {
        checkBounds(offset, length, src.length);
        int pos = position();
        int lim = limit();
        assert (pos <= lim);
        int rem = (pos <= lim ? lim - pos : 0);
        if (length > rem)
            throw new BufferOverflowException();
            Bits.copyFromArray(src, arrayBaseOffset,
                               (long)offset << 0,
                               ix(pos),
                               (long)length << 0);
        position(pos + length);
    } else {
        super.put(src, offset, length);
    }
    return this;
}
```

你不用关心上述这段代码在 DirectBuffer 中充当着什么作用，我想展示给你的仅仅是它的 checkBounds 和 一堆 if/else，尤其是追求极致性能的场景，极客们看到 if/else 会神经敏感地意识到分支预测的性能下降，第二意识是这坨代码能不能去掉。

如果你不希望有一堆边界检查，完全可以借助 Unsafe 实现一个自定义的 ByteBuffer，就像下面这样。

```java
public class UnsafeByteBuffer {

    private final long address;
    private final int capacity;
    private int position;
    private int limit;

    public UnsafeByteBuffer(int capacity) {
        this.capacity = capacity;
        this.address = Util.unsafe.allocateMemory(capacity);
        this.position = 0;
        this.limit = capacity;
    }

    public int remaining() {
        return limit - position;
    }

    public void put(ByteBuffer heapBuffer) {
        int remaining = heapBuffer.remaining();
        Util.unsafe.copyMemory(heapBuffer.array(), 16, null, address + position, remaining);
        position += remaining;
    }

    public void put(byte b) {
        Util.unsafe.putByte(address + position, b);
        position++;
    }

    public void putInt(int i) {
        Util.unsafe.putInt(address + position, i);
        position += 4;
    }

    public byte get() {
        byte b = Util.unsafe.getByte(address + position);
        position++;
        return b;
    }

    public int getInt() {
        int i = Util.unsafe.getInt(address + position);
        position += 4;
        return i;
    }

    public int position() {
        return position;
    }

    public void position(int position) {
        this.position = position;
    }

    public void limit(int limit) {
        this.limit = limit;
    }

    public void flip() {
        limit = position;
        position = 0;
    }

    public void clear() {
        position = 0;
        limit = capacity;
    }

}
```

在一些比赛中，为了避免选手进入无止境的内卷，Unsafe 通常是禁用的，但是也有一些比赛，允许使用 Unsafe 的一部分能力，让选手们放飞自我，探索可能性。例如 `Unsafe#allocateMemory` 是不会受到 `-XX:MaxDirectMemory` 和 `-Xms` 限制的，在这次第二届云原生编程挑战赛遭到了禁用，但 `Unsafe#put` 、`Unsafe#get`、`Unsafe#copyMemory` 允许被使用。 如果你一定希望使用 Unsafe 操作堆外内存，可以写出这样的代码，它跟示例代码一完成的是同样的操作。

```
byte[] src = ...;

ByteBuffer byteBuffer = ByteBuffer.allocateDirect(src.length);
long address = ((DirectBuffer)byteBuffer).address();
Util.unsafe.copyMemory(src, 16, null, address, src.length);
```

这便是我想介绍的第一个关键点：**DirectByteBuffer 可以借助 Unsafe 完成内存级别细粒度的操作，从而绕开边界检查**。

## DirectByteBuffer 的内存初始化

注意到 DirectByteBuffer 构造器中有另一个涉及到 Unsafe 的操作： `unsafe.setMemory(base, size, (byte) 0);`。这段代码主要是为了给内存初始化 0。说实话，我是没有太懂这里的初始化操作，因为按照我的认知，默认值也是 0。在某些场景或者硬件下，内存操作是非常昂贵的，尤其是大片的内存被开辟时，这段代码可能会成为 DirectByteBuffer 的瓶颈。

如果希望分配内存时，不进行这段初始化逻辑，可以借助于 Unsafe 分配内存，再对 DirectByteBuffer 进行魔改。

```java
public class AllocateDemo {

    private Field addressField;
    private Field capacityField;
    
    public AllocateDemo() throws NoSuchFieldException {
        Field capacityField = Buffer.class.getDeclaredField("capacity");
        capacityField.setAccessible(true);
        Field addressField = Buffer.class.getDeclaredField("address");
        addressField.setAccessible(true);
    }
    
    public ByteBuffer allocateDirect(int cap) throws IllegalAccessException {
        long address = Util.unsafe.allocateMemory(cap);

        ByteBuffer byteBuffer = ByteBuffer.allocateDirect(1);
        Util.unsafe.freeMemory(((DirectBuffer) byteBuffer).address());

        addressField.setLong(byteBuffer, address);
        capacityField.setInt(byteBuffer, cap);

        byteBuffer.clear();
        return byteBuffer;
    }

}
```

经过这么一顿操作，我们便得到了一份没有初始化的 DirectByteBuffer，不过不用担心，一切都在正常工作，并且 setMemory for free!

## 聊聊 ByteBuffer 的零拷贝

算作是题外话了，主要是跟 ByteBuffer 相关的一个话题：零拷贝。 ByteBuffer 在作为读缓冲区时被使用时，有一部分小伙伴会选择使用加锁的方式访问内存，但其实这是非常错误的做法，应当使用 ByteBuffer 提供的 duplicate 和 slice 这两个方法。

并发读取缓冲的方案：

```java
ByteBuffer byteBuffer = ByteBuffer.allocateDirect(1024);
ByteBuffer duplicate = byteBuffer.duplicate();
duplicate.limit(512);
duplicate.position(256);
ByteBuffer slice = duplicate.slice();
// use slice
```

这样便可以在不改变原始 ByteBuffer 指针的前提下，任意对 slice 后的 ByteBuffer 进行并发读取了。

## 总结

最近时间有限，白天工作，晚上还要抽时间打比赛，先分享这么多。更多性能优化小技巧，可以期待一下 1~2 个星期云原生比赛结束，我就开始继续发总结和其他调优方案。

本文阅读求个 1000，不过分吧！

一键三连，这次一定。

