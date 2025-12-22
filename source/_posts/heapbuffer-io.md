---
title: 使用堆内内存HeapByteBuffer的注意事项
toc: true
type: 1
date: 2021-10-07 23:16:50
categories:
  - Java
tags:
- 文件IO
---

## 前言

国庆假期一眨眼就过去了，本来在家躺平的很舒服，没怎么肝云原生编程挑战赛，传送门：https://tianchi.aliyun.com/s/8bf1fe4ae2aea736e692c31c6952042d ，偏偏对手们假期开始卷起来了，眼看就要被人反超了，吓得我赶紧继续优化了。比赛大概还有一个月才结束，Kirito 的详细方案也会在比赛结束后分享，这期间我会分享一些比赛中的一些通用优化或者细节知识点，例如本文就是这么一个例子。

趁着假期最后一天，分享一个很多人容易踩得一个坑：HeapByteBuffer 的使用问题。我们都知道 NIO 分装了 ByteBuffer 接口，使得 filechannel 的文件 IO API 变得非常的简单。ByteBuffer 主要有两个实现类

- HeapByteBuffer 堆内内存
- DirectByteBuffer 堆外内存

按我的个人经验，大多数情况，无论是读操作还是写操作，我都倾向于使用 DirectByteBuffer，主要是因为 HeapByteBuffer 在和 FileChannel 交互时，可能会有一些出乎大家意料的内部操作，也就是这篇文章的标题中提到的注意事项，这里先卖个关子。

先来看看这次比赛为什么要用到 HeapByteBuffer 呢？

原因一：赛题需要设计分级存储，并且提供了 6G 堆内内存 + 2G 堆外内存，一个最直接的思路便是使用内存来存储热点数据，而内存存储数据最方便的数据结构便是 ByteBuffer 了。

原因二：由于堆内 6G 远大于堆外 2G，且 JVM 参数不能调整，所以要想利用好堆内富余的内存去做缓存，非 HeapByteBuffer 莫属了。

可能有一些读者并没有关注赛题，我这里简化一下前言，可以直接理解为：有一块 2G 的 HeapByteBuffer 用于文件 IO，我们该如何利用。

<!-- more -->

## HeapByteBuffer 的复制问题

废话不多说，直接来看 HeapByteBuffer 的坑在哪儿。

使用代码描述 HeapByteBuffer 的文件 IO 操作，大概率会写出如下的代码：

```java
public void readInOneThread() throws Exception {
    int bufferSize = 50 * 1024 * 1024;
    File file = new File("/essd");
    FileChannel fileChannel = new RandomAccessFile(file, "rw").getChannel();
    ByteBuffer byteBuffer = ByteBuffer.allocate(bufferSize);
    fileChannel.read(byteBuffer);
}
```

上述的代码，将文件中的数据缓存到了内存中，无论是赛题还是生产场景，这个行为通常都是多线程的，例如在云原生编程挑战赛的评测下，有 40 个线程进行读写，如果按照线程维度进行缓存，每个线程分到 50M 用于内存缓存自然是没有问题。

而如果你直接使用上述代码，在评测中可能会直接得到内存溢出相关的异常。其实我在之前堆外内存泄漏的文章中也提到过这个问题，不过角度有所不同。原因很简单，直接来看源码。

FileChannel 使用的是 IOUtil 进行读写操作

```java sun.nio.ch.IOUtil#read
static int read(FileDescriptor var0, ByteBuffer var1, long var2, NativeDispatcher var4) throws IOException {
    if (var1.isReadOnly()) {
        throw new IllegalArgumentException("Read-only buffer");
    } else if (var1 instanceof DirectBuffer) {
        return readIntoNativeBuffer(var0, var1, var2, var4);
    } else {
        ByteBuffer var5 = Util.getTemporaryDirectBuffer(var1.remaining());
        int var7;
        try {
            int var6 = readIntoNativeBuffer(var0, var5, var2, var4);
            var5.flip();
            if (var6 > 0) {
                var1.put(var5);
            }
            var7 = var6;
        } finally {
            Util.offerFirstTemporaryDirectBuffer(var5);
        }
        return var7;
    }
}
```

可以发现当使用 HeapByteBuffer 时，会走到下面这个分支

```java
Util.getTemporaryDirectBuffer(var1.remaining());
```

这个 Util 封装了更为底层的一些 IO 逻辑

```java
package sun.nio.ch;
public class Util {
    private static ThreadLocal<Util.BufferCache> bufferCache;
    
    public static ByteBuffer getTemporaryDirectBuffer(int var0) {
        if (isBufferTooLarge(var0)) {
            return ByteBuffer.allocateDirect(var0);
        } else {
            // FOUCS ON THIS LINE
            Util.BufferCache var1 = (Util.BufferCache)bufferCache.get();
            ByteBuffer var2 = var1.get(var0);
            if (var2 != null) {
                return var2;
            } else {
                if (!var1.isEmpty()) {
                    var2 = var1.removeFirst();
                    free(var2);
                }

                return ByteBuffer.allocateDirect(var0);
            }
        }
    }
}
```

isBufferTooLarge 这个方法会根据传入 Buffer 的大小决定如何分配堆外内存，如果过大，直接分配大缓冲区；如果不是太大，会使用 bufferCache 这个 ThreadLocal 变量来进行缓存，从而复用（实际上这个数值非常大，几乎不会走进直接分配堆外内存这个分支）。这么看来似乎发现了两个不得了的结论：

1. 使用 HeapByteBuffer 读写都会经过 DirectByteBuffer，写入数据的流转方式其实是：HeapByteBuffer -> DirectByteBuffer -> PageCache -> Disk，读取数据的流转方式正好相反。
2. 使用 HeapByteBuffer 读写会申请一块跟线程绑定的 DirectByteBuffer。这意味着，线程越多，临时 DirectByteBuffer 就越会占用越多的空间。

根据这两个结论，我们再回到赛题中，如果直接按照上述的方式进行读写，40 个线程每个都持有一个 50M 的堆内内存，同时又因为 IOUtil  的内部行为，额外分配了 40*50M 的堆外内存， 堆外内存在不经意间就被用光了！出现堆外内存溢出的异常也就不奇怪了。

## 为什么 HeapByteBuffer 在 IO 时需要复制到 DirectByteBuffer

这个我之前也介绍过，详情可以参考我的一篇旧文：《一文探讨堆外内存的监控与回收》。总结如下：

- 为了方便 GC 的实现，DirectByteBuffer 指向的 native memory 是不受 GC 管辖的
- HeapByteBuffer 背后使用的是 byte 数组，其占用的内存不一定是连续的，不太方便 JNI 方法的调用
- 数组实现在不同 JVM 中可能会不同

## 解决方案

其实我们本质上是为了给每个线程维护一块 HeapByteBuffer，用于缓存数据，并没有必要以 ByteBuffer 的大小为维度来进行 IO。可以借鉴 IOUtil 中复制 DirectByteBuffer 的思路来优化这一过程。代码示例如下：

```java
public void directBufferCopy() throws Exception {
    File file = new File("/essd");
    FileChannel fileChannel = new RandomAccessFile(file, "rw").getChannel();
    ByteBuffer byteBuffer = ByteBuffer.allocate(50 * 1024 * 1024);
    ByteBuffer directByteBuffer = ByteBuffer.allocateDirect(4 * 1024);
    for (int i = 0; i < 12800; i++) {
        directByteBuffer.clear();
        fileChannel.read(directByteBuffer, i * 4 * 1024);
        directByteBuffer.flip();
        byteBuffer.put(directByteBuffer);
    }
}
```

在 Java 中，从磁盘到堆内内存，一定无法省略堆外内存的复制，但我们可以自己复制，从而使得这个过程更加直观地被我们自己操控，而不是被 FileChannel 的内部逻辑左右。

这里也需要注意

- 单次 IO 使用的 DirectByteBuffer 不宜过大，仅仅作为一个运输载体，起到一个运输数据的作用。这样在多线程场景下，才不至于占用过多的堆外内存
- 单次 IO 使用的 DirectByteBuffer 不宜过小，否则会出现读写放大的问题，一般建议设置 4kb 的整数倍，具体以实际测试结果为准。

## 其他注意事项

HeapByteBuffer 读写时的复制问题是本文的主角，但使用 HeapByteBuffer 作为缓存时，也需要注意一些其他问题。例如比赛场景中，你可能希望开辟一大块 HeapByteBuffer，6G 堆内内存，分配个 4G 用作缓存总可以吧？可不可以我说了不算，你感兴趣的话倒是可以测试一下是否可行，还需要考虑 GC 情况，需要综合考虑老年代和新生代的配比，如果你分配了过多堆内内存给 HeapByteBuffer 缓存，可能会直接导致 OutOfMemory 或者触发 GC。

同时，如果 HeapByteBuffer 占用了过多内存，留给操作系统的 PageCache 也会非常有限，这两者使用的可是同一块内存！如果你的程序利用到了 PageCache 的特性，可能会由于 PageCache 空间不够，导致 IO 速度变慢。

## 总结

本文介绍了在文件 IO 中使用 HeapByteBuffer 的注意事项，需要考虑到 FileChannel 内部的复制问题，意识到这一过程会有堆外内存的复制开销。在实际使用场景中，个人更加推荐直接使用 DirectByteBuffer 进行 IO 操作。如果出于某些原因，一定需要使用 HeapByteBuffer 存储作为缓存，可以参考文中分批使用 DirectByteBuffer 进行 IO 并复制的方案。