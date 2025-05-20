---
title: Java 文件 IO 操作之 DirectIO
date: 2019-03-02 15:45:13
tags:
- DirectIO
- JNA
categories:
- 文件IO
toc: true
---

在前文《文件 IO 操作的一些最佳实践》中，我介绍了一些 Java 中常见的文件操作的接口，并且就 PageCache 和 DIrect IO 进行了探讨，最近我自己封装了一个 Direct IO 的库，趁着这个机会，本文重点谈谈 Java 中 Direct IO 的意义，以及简单介绍下我自己的轮子。

<!-- more -->

### Java 中的 Direct IO

如果你阅读过我之前的文章，应该已经了解 Java 中常用的文件操作接口为：FileChannel，并且没有直接操作 Direct IO 的接口。这也就意味着 Java 无法绕开 PageCache 直接对存储设备进行读写，但对于使用 Java 语言来编写的数据库，消息队列等产品而言，的确存在绕开 PageCache 的需求：

- PageCache 属于操作系统层面的概念，用户层面很难干预，User BufferCache 显然比 Kernel PageCache 要可控
- 现代操作系统会使用尽可能多的空闲内存来充当 PageCache，当操作系统回收 PageCache 内存的速度低于应用写缓存的速度时，会影响磁盘写入的速率，直接表现为写入 RT 增大，这被称之为“毛刺现象”

PageCache 可能会好心办坏事，采用 Direct IO + 自定义内存管理机制会使得产品更加的可控，高性能。

### Direct IO 的限制

在 Java 中使用 Direct IO 最终需要调用到 c 语言的 pwrite 接口，并设置 O_DIRECT flag，使用 O_DIRECT 存在不少限制

- 操作系统限制：Linux 操作系统在 2.4.10 及以后的版本中支持 O_DIRECT flag，老版本会忽略该 Flag；Mac OS 也有类似于 O_DIRECT 的机制
- 用于传递数据的缓冲区，其内存边界必须对齐为 blockSize 的整数倍
- 用于传递数据的缓冲区，其传递数据的大小必须是 blockSize 的整数倍。
- 数据传输的开始点，即文件和设备的偏移量，必须是 blockSize 的整数倍

> 查看系统 blockSize 大小的方式：stat /boot/|grep "IO Block"
>
> ubuntu@VM-30-130-ubuntu:~$ stat /boot/|grep "IO Block"
>   Size: 4096            Blocks: 8          IO Block: 4096   directory
>
> 通常为 4kb

### Java 使用 Direct IO

#### 项目地址

https://github.com/lexburner/kdio

#### 引入依赖

```xml
<dependency>
    <groupId>moe.cnkirito.kdio</groupId>
    <artifactId>kdio-core</artifactId>
    <version>1.0.0</version>
</dependency>
```

#### 注意事项

```java
// file path should be specific since the different file path determine whether your system support direct io
public static DirectIOLib directIOLib = DirectIOLib.getLibForPath("/");
// you should always write into your disk the Integer-Multiple of block size through direct io.
// in most system, the block size is 4kb
private static final int BLOCK_SIZE = 4 * 1024;
```

#### Direct IO 写

```java
private static void write() throws IOException {
    if (DirectIOLib.binit) {
        ByteBuffer byteBuffer = DirectIOUtils.allocateForDirectIO(directIOLib, 4 * BLOCK_SIZE);
        for (int i = 0; i < BLOCK_SIZE; i++) {
            byteBuffer.putInt(i);
        }
        byteBuffer.flip();
        DirectRandomAccessFile directRandomAccessFile = new DirectRandomAccessFile(new File("./database.data"), "rw");
        directRandomAccessFile.write(byteBuffer, 0);
    } else {
        throw new RuntimeException("your system do not support direct io");
    }
}
```

#### Direct IO 读

```java
public static void read() throws IOException {
    if (DirectIOLib.binit) {
        ByteBuffer byteBuffer = DirectIOUtils.allocateForDirectIO(directIOLib, 4 * BLOCK_SIZE);
        DirectRandomAccessFile directRandomAccessFile = new DirectRandomAccessFile(new File("./database.data"), "rw");
        directRandomAccessFile.read(byteBuffer, 0);
        byteBuffer.flip();
        for (int i = 0; i < BLOCK_SIZE; i++) {
            System.out.print(byteBuffer.getInt() + " ");
        }
    } else {
        throw new RuntimeException("your system do not support direct io");
    }
}
```

#### 主要 API

1. `DirectIOLib.java` 提供 Native 的 pwrite 和 pread
2. `DirectIOUtils.java` 提供工具类方法，比如分配 Block 对齐的 ByteBuffer
3. `DirectChannel/DirectChannelImpl.java` 提供对 fd 的 Direct 包装，提供类似 `FileChannel` 的读写 API。
4. `DirectRandomAccessFile.java` 通过 DIO 的方式打开文件，并暴露 IO 接口。

### 总结

这个简单的 Direct IO 框架参考了 [smacke/jaydio](https://github.com/smacke/jaydio)，这个库自己搞了一套 Buffer 接口跟 JDK 的类库不兼容，且读写实现里面加了一块 Buffer 用于缓存内容至 Block 对齐有点破坏 Direct IO 的语义。同时，感谢尘央同学的指导，这个小轮子的代码量并不多，初始代码引用自他的一个小 demo（已获得本人授权）。为什么需要这么一个库？主要是考虑后续会出现像「中间件性能挑战赛」和「PolarDB 性能挑战赛」这样的比赛，Java 本身的 API 可能不足以发挥其优势，如果有一个库可以屏蔽掉 Java 和 CPP 选手的差距，岂不是美哉？我也将这个库发到了中央仓库，方便大家在自己的代码中引用。

后续会视需求，会这个小小的轮子增加注入 fadvise，mmap 等系统调用的映射，也欢迎对文件操作感兴趣的同学一起参与进来，pull request & issue are welcome！

### 扩展阅读

[《文件 IO 操作的一些最佳实践》](https://www.cnkirito.moe/file-io-best-practise/)

[《PolarDB 数据库性能大赛 Java 选手分享》](https://www.cnkirito.moe/polardb-race/)



**欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
