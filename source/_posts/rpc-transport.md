---
title: 深入理解 RPC 之传输篇
date: 2017-12-22 20:16:28
tags: 
- RPC
categories: RPC
toc: true
---

RPC 被称为“远程过程调用”，表明了一个方法调用会跨越网络，跨越进程，所以传输层是不可或缺的。一说到网络传输，一堆名词就蹦了出来：TCP、UDP、HTTP，同步 or 异步，阻塞 or 非阻塞，长连接 or 短连接...

本文介绍两种传输层的实现：使用 Socket 和使用 Netty。前者实现的是阻塞式的通信，是一个较为简单的传输层实现方式，借此可以了解传输层的工作原理及工作内容；后者是非阻塞式的，在一般的 RPC 场景下，性能会表现的很好，所以被很多开源 RPC 框架作为传输层的实现方式。

## RpcRequest 和 RpcResponse

传输层传输的主要对象其实就是这两个类，它们封装了请求 id，方法名，方法参数，返回值，异常等 RPC 调用中需要的一系列信息。

```java
public class RpcRequest implements Serializable {
    private String interfaceName;
    private String methodName;
    private String parametersDesc;
    private Object[] arguments;
    private Map<String, String> attachments;
    private int retries = 0;
    private long requestId;
    private byte rpcProtocolVersion;
}
```

<!-- more -->

```java
public class RpcResponse implements Serializable {
    private Object value;
    private Exception exception;
    private long requestId;
    private long processTime;
    private int timeout;
    private Map<String, String> attachments;// rpc 协议版本兼容时可以回传一些额外的信息
    private byte rpcProtocolVersion;
}
```

## Socket 传输

Server

```java
public class RpcServerSocketProvider {


    public static void main(String[] args) throws Exception {

        // 序列化层实现参考之前的章节
        Serialization serialization = new Hessian2Serialization();

        ServerSocket serverSocket = new ServerSocket(8088);
        ExecutorService executorService = Executors.newFixedThreadPool(10);
        while (true) {
            final Socket socket = serverSocket.accept();
            executorService.execute(() -> {
                try {
                    InputStream is = socket.getInputStream();
                    OutputStream os = socket.getOutputStream();
                    try {
                        DataInputStream dis = new DataInputStream(is);
                        int length = dis.readInt();
                        byte[] requestBody = new byte[length];
                        dis.read(requestBody);
                        // 反序列化 requestBody => RpcRequest
                        RpcRequest rpcRequest = serialization.deserialize(requestBody, RpcRequest.class);
                        // 反射调用生成响应 并组装成 rpcResponse
                        RpcResponse rpcResponse = invoke(rpcRequest);
                        // 序列化 rpcResponse => responseBody
                        byte[] responseBody = serialization.serialize(rpcResponse);
                        DataOutputStream dos = new DataOutputStream(os);
                        dos.writeInt(responseBody.length);
                        dos.write(responseBody);
                        dos.flush();
                    } catch (Exception e) {
                        e.printStackTrace();
                    } finally {
                        is.close();
                        os.close();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                } finally {
                    try {
                        socket.close();
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }

    }

    public static RpcResponse invoke(RpcRequest rpcRequest) {
        // 模拟反射调用
        RpcResponse rpcResponse = new RpcResponse();
        rpcResponse.setRequestId(rpcRequest.getRequestId());
        //... some operation
        return rpcResponse;
    }

}
```

Client

```java
public class RpcSocketConsumer {

    public static void main(String[] args) throws Exception {

        // 序列化层实现参考之前的章节
        Serialization serialization = new Hessian2Serialization();

        Socket socket = new Socket("localhost", 8088);
        InputStream is = socket.getInputStream();
        OutputStream os = socket.getOutputStream();
        // 封装 rpc 请求
        RpcRequest rpcRequest = new RpcRequest();
        rpcRequest.setRequestId(12345L);
        // 序列化 rpcRequest => requestBody
        byte[] requestBody = serialization.serialize(rpcRequest);
        DataOutputStream dos = new DataOutputStream(os);
        dos.writeInt(requestBody.length);
        dos.write(requestBody);
        dos.flush();
        DataInputStream dis = new DataInputStream(is);
        int length = dis.readInt();
        byte[] responseBody = new byte[length];
        dis.read(responseBody);
        // 反序列化 responseBody => rpcResponse
        RpcResponse rpcResponse = serialization.deserialize(responseBody, RpcResponse.class);
        is.close();
        os.close();
        socket.close();

        System.out.println(rpcResponse.getRequestId());
    }
}
```

dis.readInt()和 dis.read(byte[] bytes) 决定了使用 Socket 通信是一种阻塞式的操作，报文头 + 报文体的传输格式是一种常见的格式，除此之外，使用特殊的字符如空行也可以划分出报文结构。在示例中，我们使用一个 int（4 字节）来传递报问题的长度，之后传递报文体，在复杂的通信协议中，报文头除了存储报文体还会额外存储一些信息，包括协议名称，版本，心跳标识等。

在网络传输中，只有字节能够被识别，所以我们在开头引入了 Serialization 接口，负责完成 RpcRequest 和 RpcResponse 与字节的相互转换。（Serialization 的工作机制可以参考之前的文章）

使用 Socket 通信可以发现：每次 Server 处理 Client 请求都会从线程池中取出一个线程来处理请求，这样的开销对于一般的 Rpc 调用是不能够接受的，而 Netty 一类的网络框架便派上了用场。

## Netty 传输

Server 和 ServerHandler

```java
public class RpcNettyProvider {

    public static void main(String[] args) throws Exception{

        EventLoopGroup bossGroup = new NioEventLoopGroup();
        EventLoopGroup workerGroup = new NioEventLoopGroup();
        try {
            // 创建并初始化 Netty 服务端 Bootstrap 对象
            ServerBootstrap bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup);
            bootstrap.channel(NioServerSocketChannel.class);
            bootstrap.childHandler(new ChannelInitializer<SocketChannel>() {
                @Override
                public void initChannel(SocketChannel channel) throws Exception {
                    ChannelPipeline pipeline = channel.pipeline();
                    pipeline.addLast(new RpcDecoder(RpcRequest.class)); // 解码 RPC 请求
                    pipeline.addLast(new RpcEncoder(RpcResponse.class)); // 编码 RPC 响应
                    pipeline.addLast(new RpcServerHandler()); // 处理 RPC 请求
                }
            });
            bootstrap.option(ChannelOption.SO_BACKLOG, 1024);
            bootstrap.childOption(ChannelOption.SO_KEEPALIVE, true);
            ChannelFuture future = bootstrap.bind("127.0.0.1", 8087).sync();
            // 关闭 RPC 服务器
            future.channel().closeFuture().sync();
        } finally {
            workerGroup.shutdownGracefully();
            bossGroup.shutdownGracefully();
        }
    }

}
```

```java
public class RpcServerHandler extends SimpleChannelInboundHandler<RpcRequest> {

    @Override
    public void channelRead0(final ChannelHandlerContext ctx, RpcRequest request) throws Exception {
        RpcResponse rpcResponse = invoke(request);
        // 写入 RPC 响应对象并自动关闭连接
        ctx.writeAndFlush(rpcResponse).addListener(ChannelFutureListener.CLOSE);
    }

    private RpcResponse invoke(RpcRequest rpcRequest) {
        // 模拟反射调用
        RpcResponse rpcResponse = new RpcResponse();
        rpcResponse.setRequestId(rpcRequest.getRequestId());
        //... some operation
        return rpcResponse;
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        cause.printStackTrace();
        ctx.close();
    }
}
```

Client 和 ClientHandler

```java
public class RpcNettyConsumer {

    public static void main(String[] args) throws Exception{
        EventLoopGroup group = new NioEventLoopGroup();
        try {
            // 创建并初始化 Netty 客户端 Bootstrap 对象
            Bootstrap bootstrap = new Bootstrap();
            bootstrap.group(group);
            bootstrap.channel(NioSocketChannel.class);
            bootstrap.handler(new ChannelInitializer<SocketChannel>() {
                @Override
                public void initChannel(SocketChannel channel) throws Exception {
                    ChannelPipeline pipeline = channel.pipeline();
                    pipeline.addLast(new RpcEncoder(RpcRequest.class)); // 编码 RPC 请求
                    pipeline.addLast(new RpcDecoder(RpcResponse.class)); // 解码 RPC 响应
                    pipeline.addLast(new RpcClientHandler()); // 处理 RPC 响应
                }
            });
            bootstrap.option(ChannelOption.TCP_NODELAY, true);
            // 连接 RPC 服务器
            ChannelFuture future = bootstrap.connect("127.0.0.1", 8087).sync();
            // 写入 RPC 请求数据并关闭连接
            Channel channel = future.channel();

            RpcRequest rpcRequest = new RpcRequest();
            rpcRequest.setRequestId(123456L);

            channel.writeAndFlush(rpcRequest).sync();
            channel.closeFuture().sync();
        } finally {
            group.shutdownGracefully();
        }
    }

}
```

```java
public class RpcClientHandler extends SimpleChannelInboundHandler<RpcResponse> {

    @Override
    public void channelRead0(ChannelHandlerContext ctx, RpcResponse response) throws Exception {
        System.out.println(response.getRequestId());// 处理响应
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) throws Exception {
        cause.printStackTrace();
        ctx.close();
    }

}
```

使用 Netty 的好处是很方便地实现了非阻塞式的调用，关键部分都给出了注释。上述的代码虽然很多，并且和我们熟悉的 Socket 通信代码大相径庭，但大多数都是 Netty 的模板代码，启动服务器，配置编解码器等。真正的 RPC 封装操作大多集中在 Handler 的 channelRead 方法（负责读取）以及 channel.writeAndFlush 方法（负责写入）中。

```java
public class RpcEncoder extends MessageToByteEncoder {

    private Class<?> genericClass;

    Serialization serialization = new Hessian2Serialization();

    public RpcEncoder(Class<?> genericClass) {
        this.genericClass = genericClass;
    }

    @Override
    public void encode(ChannelHandlerContext ctx, Object in, ByteBuf out) throws Exception {
        if (genericClass.isInstance(in)) {
            byte[] data = serialization.serialize(in);
            out.writeInt(data.length);
            out.writeBytes(data);
        }
    }
}
```

```java
public class RpcDecoder extends ByteToMessageDecoder {

    private Class<?> genericClass;

    public RpcDecoder(Class<?> genericClass) {
        this.genericClass = genericClass;
    }

    Serialization serialization = new Hessian2Serialization();

    @Override
    public void decode(ChannelHandlerContext ctx, ByteBuf in, List<Object> out) throws Exception {
        if (in.readableBytes() < 4) {
            return;
        }
        in.markReaderIndex();
        int dataLength = in.readInt();
        if (in.readableBytes() < dataLength) {
            in.resetReaderIndex();
            return;
        }
        byte[] data = new byte[dataLength];
        in.readBytes(data);
        out.add(serialization.deserialize(data, genericClass));
    }
}
```

使用 Netty 不能保证返回的字节大小，所以需要加上 in.readableBytes()< 4 这样的判断，以及 in.markReaderIndex() 这样的标记，用来区分报文头和报文体。

## 同步与异步 阻塞与非阻塞

这两组传输特性经常被拿来做对比，很多文章声称 Socket 是同步阻塞的，Netty 是异步非阻塞，其实有点问题。

其实这两组并没有必然的联系，同步阻塞，同步非阻塞，异步非阻塞都有可能（同步非阻塞倒是没见过），而大多数使用 Netty 实现的 RPC 调用其实应当是同步非阻塞的（当然一般 RPC 也支持异步非阻塞）。

> 同步和异步关注的是 ** 消息通信机制 **
> 所谓同步，就是在发出一个 * 调用 * 时，在没有得到结果之前，该 * 调用 * 就不返回。但是一旦调用返回，就得到返回值了。
> 换句话说，就是由 * 调用者 * 主动等待这个 * 调用 * 的结果。
>
> 而异步则是相反，调用在发出之后，这个调用就直接返回了，所以没有返回结果。换句话说，当一个异步过程调用发出后，调用者不会立刻得到结果。而是在 * 调用 * 发出后，* 被调用者 * 通过状态、通知来通知调用者，或通过回调函数处理这个调用。

如果需要 RPC 调用返回一个结果，该结果立刻被使用，那意味着着大概率需要是一个同步调用。如果不关心其返回值，则可以将其做成异步接口，以提升效率。

> 阻塞和非阻塞关注的是 ** 程序在等待调用结果（消息，返回值）时的状态 **.
>
> 阻塞调用是指调用结果返回之前，当前线程会被挂起。调用线程只有在得到结果之后才会返回。
> 非阻塞调用指在不能立刻得到结果之前，该调用不会阻塞当前线程。

在上述的例子中可以看出 Socket 通信我们显示声明了一个包含 10 个线程的线程池，每次请求到来，分配一个线程，等待客户端传递报文头和报文体的行为都会阻塞该线程，可以见得其整体是阻塞的。而在 Netty 通信的例子中，每次请求并没有分配一个线程，而是通过 Handler 的方式处理请求（联想 NIO 中 Selector），是非阻塞的。

使用同步非阻塞方式的通信机制并不一定同步阻塞式的通信强，所谓没有最好，只有更合适，而一般的同步非阻塞 通信适用于 1. 网络连接数量多 2. 每个连接的 io 不频繁 的场景，与 RPC 调用较为契合。而成熟的 RPC 框架的传输层和协议层通常也会提供多种选择，以应对不同的场景。

## 总结

本文堆砌了一些代码，而难点主要是对 Socket 的理解，和 Netty 框架的掌握。Netty 的学习有一定的门槛，但实际需要掌握的知识点其实并不多（仅仅针对 RPC 框架所涉及的知识点而言），学习 Netty ，个人推荐《Netty IN ACTION》以及 https://waylau.gitbooks.io/netty-4-user-guide/Getting%20Started/Before%20Getting%20Started.html 该网站的例子。

参考资料：

http://javatar.iteye.com/blog/1123915 -- 梁飞

https://gitee.com/huangyong/rpc -- 黄勇
