---
title: 天池中间件大赛 dubboMesh 优化总结（qps 从 1000 到 6850）
date: 2018-06-19 19:47:28
tags:
- RPC
categories:
- 性能挑战赛
toc: true
---

天池中间件大赛的初赛在今早终于正式结束了，公众号停更了一个月，主要原因就是博主的空余时间几乎全花在这个比赛上，第一赛季结束，做下参赛总结，总的来说，收获不小。

![最终排名](https://kirito.iocoder.cn/image-20180619190732570.png)
<!-- more -->
先说结果，最终榜单排名是第 15 名（除去前排大佬的两个小号，加上作弊的第一名，勉强能算是第 12 名），说实话是挺满意的成绩。这篇文章主要是分享给以下读者：比赛中使用了 netty 却没有达到理想 qps 的朋友，netty 刚入门的朋友，对 dubbo mesh 感兴趣的朋友。

在比赛之前我个人对 netty 的认识也仅仅停留在了解的层面，在之前解读 RPC 原理的系列文章中涉及到 netty 传输时曾了解过一二，基本可以算零基础使用 netty 参赛，所以我会更多地站在一个小白的视角来阐述自己的优化历程，一步步地提高 qps，也不会绕开那些自己踩过的坑以及负优化。另一方面，由于自己对 netty 的理解并不是很深，所以文中如果出现错误，敬请谅解，欢迎指正。

### Dubbo Mesh 是什么？

为了照顾那些不太了解这次比赛内容的读者，我先花少量的篇幅介绍下这次阿里举办的天池中间件大赛到底比的是个什么东西，那就不得不先介绍下 Dubbo Mesh 这个概念。

如果你用过 dubbo，并且对 service mesh 有所了解，那么一定可以秒懂 Dubbo Mesh 是为了解决什么问题。说白了，dubbo 原先是为了 java 语言而准备的，没有考虑到跨语言的问题，这意味着 nodejs，python，go 要想无缝使用 dubbo 服务，要么借助于各自语言的 dubbo 客户端，例如：node-dubbo-client，python-dubbo-client，go-dubbo-client；要么就是借助于 service mesh 的解决方案，让 dubbo 自己提供跨语言的解决方案，来屏蔽不同语言的处理细节，于是乎，dubbo 生态的跨语言 service mesh 解决方案就被命名为了 dubbo mesh。一图胜千言：

![Dubbo Mesh](https://work.alibaba-inc.com/aliwork_tfs/g01_alibaba-inc_com/tfscom/TB1ctUkXwZC2uNjSZFnXXaxZpXa.tfsprivate.png)

在原先的 dubbo 生态下，只有 consumer，provider，注册中心的概念。dubbo mesh 生态下为每个服务（每个 consumer，provider 实例）启动一个 agent，服务间不再进行直接的通信，而是经由各自的 agent 完成交互，并且服务的注册发现也由 agent 完成。图中红色的 agent 便是这次比赛的核心，选手们可以选择合适的语言来实现 agent，最终比拼高并发下各自 agent 实现的 qps，qps 即最终排名的依据。

### 赛题剖析

这次比赛的主要考察点在于高并发下网络通信模型的实现，可以涵盖以下几个关键点：reactor 模型，负载均衡，线程，锁，io 通信，阻塞与非阻塞，零拷贝，序列化，http/tcp/udp 与自定义协议，批处理，垃圾回收，服务注册发现等。它们对最终程序的 qps 起着或大或小的影响，对它们的理解越深，越能够编写出高性能的 dubbo mesh 方案。

语言的选择，初赛结束后的感受，大家主要还是在 java，c++，go 中进行了抉择。语言的选择考虑到了诸多的因素，通用性，轻量级，性能，代码量和 qps 的性价比，选手的习惯等等。虽然前几名貌似都是 c++，但总体来说，排名 top 10 之外，绝不会是因为语言特性在从中阻挠。c++ 选手高性能的背后，可能是牺牲了 600 多行代码在自己维护一个 etcd-lib（比赛限制使用 etcd，但据使用 c++ 的选手说，c++ 没有提供 etcd 的 lib）；且这次比赛提供了预热环节，java 党也露出了欣慰的笑容。java 的主流框架还是在 nio，akka，netty 之间的抉择，netty 应该是众多 java 选手中较为青睐的，博主也选择了 netty 作为 dubbo mesh 的实现；go 的协程和网络库也是两把利器，并不比 java 弱，加上其进程轻量级的特性，也作为了一个选择。

官方提供了一个 qps 并不是很高的 demo，来方便选手们理解题意，可以说是非常贴心了，来回顾一下最简易的 dubbo mesh 实现：

![dubbo mesh 初始方案](https://kirito.iocoder.cn/image-20180619200219464.png)

如上图所示，是整个初始 dubbo mesh 的架构图，其中 consumer 和 provider 以灰色表示，因为选手是不能修改其实现的，绿色部分的 agent 是可以由选手们自由发挥的部分。比赛中 consumer，consumer-agent 为 单个实例，provider、provider-agent 分别启动了三个性能不一的实例：small，medium，large，这点我没有在图中表示出来，大家自行脑补。所以所有选手都需要完成以下几件事：

1. consumer-agent 需要启动一个 http 服务器，接收来自 consumer 的 http 请求
2. consumer-agent 需要转发该 http 请求给 provider-agent，并且由于 provider-agent 有多个实例，所以需要做负载均衡。consumer-agent 与 provider-agent 之间如何通信可以自由发挥。
3. provider-agent 拿到 consumer-agent 的请求之后，需要组装成 dubbo 协议， 使用 tcp 与 provider 完成通信。

这样一个跨语言的简易 dubbo mesh 便呈现在大家面前了，从 consumer 发出的 http 协议，最终成功调用到了使用 java 语言编写的 dubbo 服务。这中间如何优化，如何使用各种黑科技成就了一场非常有趣的比赛。博主所有的优化都不是一蹴而就的，都是一天天的提交试出来的，所以恰好可以使用时间线顺序叙述自己的改造历程。

### 优化历程

**Qps 1000 到 2500 (CA 与 PA 使用异步 http 通信)**

官方提供的 demo 直接跑通了整个通信流程，省去了我们大量的时间，初始版本评测可以达到 1000+ 的 qps，所以 1000 可以作为 baseline 给大家提供参考。demo 中 consumer 使用 asyncHttpClient 发送异步的 http 请求， consumer-agent 使用了 springmvc 支持的 servlet3.0 特性；而 consumer-agent 到 provider-agent 之间的通信却使用了同步 http，所以 C 到 CA 这一环节相比 CA 到 PA 这一环节性能是要强很多的。改造起来也很简单，参照 C 到 CA 的设计，直接将 CA 到 PA 也替换成异步 http，qps 可以直接到达 2500。

主要得益于 async-http-client 提供的异步 http-client，以及 servlet3.0 提供的非阻塞 api。

```xml
<dependency>
    <groupId>org.asynchttpclient</groupId>
    <artifactId>async-http-client</artifactId>
    <version>2.4.7</version>
</dependency>
```

```Java
// 非阻塞发送 http 请求
ListenableFuture<org.asynchttpclient.Response> responseFuture = asyncHttpClient.executeRequest(request);

// 非阻塞返回 http 响应
@RequestMapping(value = "/invoke")
public DeferredResult<ResponseEntity> invoke(){}
```

**Qps 2500 到 2800 (负载均衡优化为加权轮询)**

demo 中提供的负载均衡算法是随机算法，在 small-pa，medium-pa，large-pa 中随机选择一个访问，每个服务的性能不一样，响应时间自然也不同，随机负载均衡算法存在严重的不稳定性，无法按需分配请求，所以成了自然而然的第二个改造点。

优化为加权轮询算法，这一块的实现参考了 motan（weibo 开源的 rpc 框架）的实现，详见 `com.alibaba.dubbo.performance.demo.agent.cluster.loadbalance.WeightRoundRobinLoadBalance`(文末贴 git 地址)。

在启动脚本中配置权重信息，伴随 pa 启动注册服务地址到 etcd 时，顺带将权重信息一并注册到 etcd 中，ca 拉取服务列表时即可获取到负载比例。

```
large:
-Dlb.weight=3
medium:
-Dlb.weight=2
small:
-Dlb.weight=1
```

预热赛时最高并发为 256 连接，这样的比例可以充分发挥每个 pa 的性能。

**Qps 2800 到 3500 (future->callback)**

c 到 ca 以及 ca 到 pa 此时尽管是 http 通信，但已经实现了非阻塞的特性（请求不会阻塞 io 线程），但 dubbo mesh 的 demo 中 pa 到 p 的这一通信环节还是使用的 future.get + countDownLatch 的阻塞方式，一旦整个环节出现了锁和阻塞，qps 必然上不去。关于几种获取结果的方式，也是老生常谈的话题：

![基础通信模型](https://cdn.yuque.com/yuque/0/2018/png/101192/1525856256886-9eefdf3f-9dd5-471b-94bb-1b76dcdd3bb3.png)

future 方式在调用过程中不会阻塞线程，但获取结果是会阻塞线程，provider 固定 sleep 了 50 ms，所以获取 future 结果依旧是一个耗时的过程，加上这种模型一般会使用锁来等待，性能会造成明显的下降。替换成 callback 的好处是，io 线程专注于 io 事件，降低了线程数，这和 netty 的 io 模型也是非常契合的。

```Java
Promise<Integer> agentResponsePromise = new DefaultPromise<>(ctx.executor());
agentResponsePromise.addListener();
```

netty 为此提供了默认的 Promise 的抽象，以及 DefaultPromise 的默认实现，我们可以 out-of-box 的使用 callback 特性。在 netty 的入站 handler 的 channelRead 事件中创建 promise，拿到 requestId，建立 requestId 和 promise 的映射；在出站 handler 的 channelRead 事件中拿到返回的 requestId，查到 promise，调用 done 方法，便完成了非阻塞的请求响应。可参考： 入站 handler `ConsumerAgentHttpServerHandler` 和  和出站 handler  `ConsumerAgentClientHandler` 的实现。

**Qps 3500 到 4200 (http 通信替换为 tcp 通信)**

ca 到 pa 的通信原本是异步 http 的通信方式，完全可以参考 pa 到 p 的异步 tcp 通信进行改造。自定义 agent 之间的通信协议也非常容易，考虑到 tcp 粘包的问题，使用定长头 + 字节数组来作为自定义协议是一个较为常用的做法。这里踩过一个坑，原本想使用 protoBuffer 来作为自定义协议，netty 也很友好的提供了基于 protoBuffer 协议的编解码器，只需要编写好 DubboMeshProto.proto 文件即可：

```protobuf
message AgentRequest {
    int64 requestId = 1;
    string interfaceName = 2;
    string method = 3;
    string parameterTypesString = 4;
    string parameter = 5;
}

message AgentResponse {
    int64 requestId = 1;
    bytes hash = 2;
}
```

protoBuffer 在实际使用中的优势是毋庸置疑的，其可以尽可能的压缩字节，减少 io 码流。在正式赛之前一直用的好好的，但后来的 512 并发下通过 jprofile 发现，DubboMeshProto 的 getSerializedSize ,getDescriptorForType 等方法存在不必要的耗时，对于这次比赛中如此简单的数据结构而言 protoBuffer 并不是那么优秀。最终还是采取了定长头 + 字节数组的自定义协议。参考：`com.alibaba.dubbo.performance.demo.agent.protocol.simple.SimpleDecoder`

http 通信既然换了，干脆一换到底，ca 的 springmvc 服务器也可以使用 netty 实现，这样更加有利于实现 ca 整体的 reactive。使用 netty 实现 http 服务器很简单，使用 netty 提供的默认编码解码器即可。

```java
public class ConsumerAgentHttpServerInitializer extends ChannelInitializer<SocketChannel> {
    @Override
    public void initChannel(SocketChannel ch) {
        ChannelPipeline p = ch.pipeline();
        p.addLast("encoder", new HttpResponseEncoder());
        p.addLast("decoder", new HttpRequestDecoder());
        p.addLast("aggregator", new HttpObjectAggregator(10 * 1024 * 1024));
        p.addLast(new ConsumerAgentHttpServerHandler());
    }
}
```

http 服务器的实现也踩了一个坑，解码 http request 请求时没注意好 ByteBuf 的释放，导致 qps 跌倒了 2000+，反而不如 springmvc 的实现。在队友 @闪电侠的帮助下成功定位到了内存泄露的问题。

```java
public static Map<String, String> parse(FullHttpRequest req) {
    Map<String, String> params = new HashMap<>();
    // 是 POST 请求
    HttpPostRequestDecoder decoder = new HttpPostRequestDecoder(new DefaultHttpDataFactory(false), req);
    List<InterfaceHttpData> postList = decoder.getBodyHttpDatas();
    for (InterfaceHttpData data : postList) {
        if (data.getHttpDataType() == InterfaceHttpData.HttpDataType.Attribute) {
            MemoryAttribute attribute = (MemoryAttribute) data;
            params.put(attribute.getName(), attribute.getValue());
        }
    }
    // resolve memory leak
    decoder.destroy();
    return params;
}
```

在正式赛后发现还有更快的 decode 方式，不需要借助于上述的 HttpPostRequestDecoder，而是改用 QueryStringDecoder：

```Java
public static Map<String, String> fastParse(FullHttpRequest httpRequest) {
    String content = httpRequest.content().toString(StandardCharsets.UTF_8);
    QueryStringDecoder qs = new QueryStringDecoder(content, StandardCharsets.UTF_8, false);
    Map<String, List<String>> parameters = qs.parameters();
    String interfaceName = parameters.get("interface").get(0);
    String method = parameters.get("method").get(0);
    String parameterTypesString = parameters.get("parameterTypesString").get(0);
    String parameter = parameters.get("parameter").get(0);
    Map<String, String> params = new HashMap<>();
    params.put("interface", interfaceName);
    params.put("method", method);
    params.put("parameterTypesString", parameterTypesString);
    params.put("parameter", parameter);
    return params;
}
```

节省篇幅，直接在这儿将之后的优化贴出来，后续不再对这个优化赘述了。

**Qps 4200 到 4400 (netty 复用 eventLoop)**

这个优化点来自于比赛认识的一位好友 @半杯水，由于没有使用过 netty，比赛期间恶补了一下 netty 的线程模型，得知了 netty 可以从客户端引导 channel，从而复用 eventLoop。不了解 netty 的朋友可以把 eventLoop 理解为 io 线程，如果入站的 io 线程和 出站的 io 线程使用相同的线程，可以减少不必要的上下文切换，这一点在 256 并发下可能还不明显，只有 200 多 qps 的差距，但在 512 下尤为明显。复用 eventLoop 在《netty 实战》中是一个专门的章节，篇幅虽然不多，但非常清晰地向读者阐释了如何复用 eventLoop（注意复用同时存在于 ca 和 pa 中）。

```java
// 入站服务端的 eventLoopGroup
private EventLoopGroup workerGroup;

// 为出站客户端预先创建好的 channel
private void initThreadBoundClient(EventLoopGroup workerGroup) {
    for (EventExecutor eventExecutor : eventLoopGroup) {
        if (eventExecutor instanceof EventLoop) {
            ConsumerAgentClient consumerAgentClient = new ConsumerAgentClient((EventLoop) eventExecutor);
            consumerAgentClient.init();
            ConsumerAgentClient.put(eventExecutor, consumerAgentClient);
        }

    }
}
```

使用入站服务端的 eventLoopGroup 为出站客户端预先创建好 channel，这样可以达到复用 eventLoop 的目的。并且此时还有一个伴随的优化点，就是将存储 Map<requestId,Promise> 的数据结构，从 concurrentHashMap 替换为了 ThreadLocal<HashMap> , 因为入站线程和出站线程都是相同的线程，省去一个 concurrentHashMap 可以进一步降低锁的竞争。

到了这一步，整体架构已经清晰了，c->ca，ca->pa，pa->p 都实现了异步非阻塞的 reactor 模型，qps 在 256 并发下，也达到了 4400 qps。

![优化后的 dubbo mesh 方案](https://kirito.iocoder.cn/image-20180619214121418.png)

### 正式赛 512 连接带来的新格局

上述这份代码在预热赛 256 并发下表现尚可，但正式赛为了体现出大家的差距，将最高并发数直接提升了一倍，但 qps 却并没有得到很好的提升，卡在了 5400 qps。和 256 连接下同样 4400 的朋友交流过后，发现我们之间的差距主要体现在 ca 和 pa 的 io 线程数，以及 pa 到 p 的连接数上。5400 qps 显然低于我的预期，为了降低连接数，我修改了原来 provider-agent 的设计。从以下优化开始，是正式赛 512 连接下的优化，预热赛只有 256 连接。

**Qps 5400 到 5800 (降低连接数)**

对 netty 中 channel 的优化搜了很多文章，依旧不是很确定连接数到底是不是影响我代码的关键因素，在和小伙伴沟通之后实在找不到 qps 卡在 5400 的原因，于是乎抱着试试的心态修改了下 provider-agent 的设计，采用了和 consumer-agent 一样的设计，预先拿到 provder-agent 入站服务器的 woker 线程组，创建出站请求的 channel，将原来的 4 个线程，4 个 channel 降低到了 1 个线程，一个 channel。其他方面未做任何改动，qps 顺利达到了 5800。

理论上来说，channel 数应该不至于成为性能的瓶颈，可能和 provider dubbo 的线程池策略有关，最终得出的经验就是：在 server 中合理的在 io 事件处理能力的承受范围内，使用尽可能少的连接数和线程数，可以提升 qps，减少不必要的线程切换。顺带一提（此时 ca 的线程数为 4，入站连接为 http 连接，最高为 512 连接，出站连接由于和线程绑定，又需要做负载均衡，所以为
$$
线程数 *pa 数 =4*3=12
$$
这个阶段，还存在另一个问题，由于 provider 线程数固定为 200 个线程，如果 large-pa 继续分配 3/1+2+3=0.5 即 50% 的请求，很容易出现 provider 线程池饱满的异常，所以调整了加权值为 1：2：2。限制加权负载均衡的不再仅仅是机器性能，还要考虑到 provider 的连接处理能力。

**Qps 5800 到 6100 (Epoll 替换 Nio)**

依旧感谢 @半杯水的提醒，由于评测环境使用了 linux 作为评测环境，所以可以使用 netty 自己封装的 EpollSocketChannel 来代替 NioSocketChannel，这个提升远超我的想象，直接帮助我突破了 6000 的关卡。

```Java
private EventLoopGroup bossGroup = Epoll.isAvailable()? new EpollEventLoopGroup(1) : new NioEventLoopGroup(1);
private EventLoopGroup workerGroup = Epoll.isAvailable()? new EpollEventLoopGroup(2) : new NioEventLoopGroup(2);
bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup)
                    .channel(Epoll.isAvailable() ? EpollServerSocketChannel.class : NioServerSocketChannel.class)
```

本地调试由于我是 mac 环境，没法使用 Epoll，所以加了如上的判断。

NioServerSocketChannel 使用了 jdk 的 nio，其会根据操作系统选择使用不同的 io 模型，在 linux 下同样是 epoll，但默认是 level-triggered ，而 netty 自己封装的 EpollSocketChannel 默认是 edge-triggered。 我原先以为是 et 和 lt 的差距导致了 qps 如此大的悬殊，但后续优化 Epoll 参数时发现 EpollSocketChannel 也可以配置为 level-triggered，qps 并没有下降，在比赛的特殊条件下，个人猜想并不是这两种触发方式带来的差距，而仅仅是 netty 自己封装 epoll 带来的优化。

```java
// 默认
bootstrap.option(EpollChannelOption.EPOLL_MODE, EpollMode.EDGE_TRIGGERED);
// 可修改触发方式
bootstrap.option(EpollChannelOption.EPOLL_MODE, EpollMode.LEVEL_TRIGGERED);
```

**Qps 6100 到 6300 (agent 自定义协议优化)**

agent 之间的自定义协议我之前已经介绍过了，由于一开始我使用了 protoBuf，发现了性能问题，就是在这儿发现的。在 512 下 protoBuf 的问题尤为明显，最终为了保险起见，以及为了和我后面的一个优化兼容，最终替换为了自定义协议—Simple 协议，这一点优化之前提到了，不在过多介绍。

**Qps 6300 到 6500 (参数调优与 zero-copy)**

这一段优化来自于和 @折袖 - 许华建 的交流，非常感谢。又是一个对 netty 不太了解而没注意的优化点：

1. 关闭 netty 的内存泄露检测：

```shell
-Dio.netty.leakDetectionLevel=disabled
```

netty 会在运行期定期抽取 1% 的 ByteBuf 进行内存泄露的检测，关闭这个参数后，可以获得性能的提升。

2. 开启 quick_ack：

```
bootstrap.option(EpollChannelOption.TCP_QUICKACK, java.lang.Boolean.TRUE)
```

tcp 相比 udp ，一个区别便是为了可靠传输而进行的 ack，netty 为 Epoll 提供了这个参数，可以进行 quick ack，具体原理没来及研究。

3. 开启 TCP_NODELAY

```java
serverBootstrap.childOption(ChannelOption.TCP_NODELAY, true)
```

这个优化可能大多数人都知道，放在这儿一起罗列出来。网上搜到了一篇阿里毕玄的 rpc 优化文章，提到高并发下 `ChannelOption.TCP_NODELAY=false` 可能更好，但实测之后发现并不会。

其他调优的参数可能都是玄学了，对最终的 qps 影响微乎其微。参数调优并不能体现太多的技巧，但对结果产生的影响却是很可观的。

在这个阶段还同时进行了一个优化，和参数调优一起进行的，所以不知道哪个影响更大一些。demo 中 dubbo 协议编码没有做到 zero-copy，这无形中增加了一份数据从内核态到用户态的拷贝；自定义协议之间同样存在这个问题，在 dubbo mesh 的实践过程中应该尽可能做到：能用 ByteBuf 的地方就不要用其他对象，ByteBuf 提供的 slice 和 CompositeByteBuf 都可以很方便的实现 zero-copy。

**Qps 6500 到 6600 (自定义 http 协议编解码)**

看着榜单上的人 qps 逐渐上升，而自己依旧停留在 6500，于是乎动了歪心思，GTMD 的通用性，自己解析 http 协议得了，不要 netty 提供的 http 编解码器，不需要比 HttpPostRequestDecoder 更快的 QueryStringDecoder，就一个偏向于固定的 http 请求，实现自定义解析非常简单。

```http
POST / HTTP/1.1\r\n
content-length: 560\r\n
content-type: application/x-www-form-urlencoded\r\n
host: 127.0.0.1:20000\r\n
\r\n
interface=com.alibaba.dubbo.performance.demo.provider.IHelloService&method=hash&parameterTypesString=Ljava%32lang%32String;&parameter=xxxxx
```

http 文本协议本身还是稍微有点复杂的，所以 netty 的实现考虑到通用性，必然不如我们自己解析来得快，具体的粘包过程就不叙述了，有点 hack 的倾向。

同理，response 也自己解析：

```http
HTTP/1.1 200 OK\r\n
Connection: keep-alive\r\n
Content-Type: text/plain;charset=UTF-8\r\n
Content-Length: 6\r\n
\r\n
123456
```

**Qps 6600 到 6700 (去除对象)**

继续丧心病狂，不考虑通用性，把之前所有的中间对象都省略，encode 和 decode 尽一切可能压缩到 handler 中去处理，这样的代码看起来非常难受，存在不少地方的 hardcoding。但效果是存在的，ygc 的次数降低了不少，全程使用 ByteBuf 和 byte[] 来进行数据交互。这个优化点同样存在存在 hack 倾向，不过多赘述。

**Qps 6700 到 6850 (批量 flush，批量 decode)**

事实上到了 6700 有时候还是需要看运气的，从群里的吐槽现象就可以发现，512 下的网路 io 非常抖，不清楚是机器的问题还是高并发下的固有现象，6700 的代码都能抖到 5000 分。所以 6700 升 6850 的过程比较曲折，而且很不稳定，提交 20 次一共就上过两次 6800+。

所做的优化是来自队友 @闪电侠的批量 flush 类，一次传输的字节数可以提升，使得网络 io 次数可以降低，原理可以简单理解为：netty 中 write 10 次，flush 1 次。一共实现了两个版本的批量 flush。一个版本是根据同一个 channel write 的次数积累，最终触发 flush；另一个版本是根据一次 eventLoop 结束才强制 flush。经过很多测试，由于环境抖动太厉害，这两者没测出多少差距。

```java
handler(new ChannelInitializer<SocketChannel>() {
	@Override
	protected void initChannel(SocketChannel ch) {
	ch.pipeline()
		.addLast(new SimpleDecoder())
		.addLast(new BatchFlushHandler(false))
		.addLast(new ConsumerAgentClientHandler());
	}
});
```

批量 decode 的思想来自于蚂蚁金服的 rpc 框架 sofa-bolt 中提供的一个抽象类：AbstractBatchDecoder

![img](https://cdn.yuque.com/yuque/0/2018/png/101192/1525856636255-170ec5a4-a826-47f6-b9f2-e2cc2b1acc59.png)

Netty 提供了一个方便的解码工具类 `ByteToMessageDecoder` ，如图上半部分所示，这个类具备 `accumulate` 批量解包能力，可以尽可能的从 `socket` 里读取字节，然后同步调用 `decode` 方法，解码出业务对象，并组成一个 `List` 。最后再循环遍历该 `List` ，依次提交到 `ChannelPipeline` 进行处理。此处我们做了一个细小的改动，如图下半部分所示，即将提交的内容从单个 `command` ，改为整个 `List` 一起提交，如此能减少 `pipeline` 的执行次数，同时提升吞吐量。这个模式在低并发场景，并没有什么优势，而在高并发场景下对提升吞吐量有不小的性能提升。

值得指出的一点：这个对于 dubbo mesh 复用 eventLoop 的特殊场景下的优化效果其实是存疑的，但我的最好成绩的确是使用了 AbstractBatchDecoder 之后跑出来的。我曾经单独将 ByteToMessageDecoder 和 AbstractBatchDecoder 拉出跑了一次分，的确是后者 qps 更高。

### 总结

其实在 qps 6500 时，整体代码还是挺漂亮的，至少感觉能拿的出手给别人看。但最后为了性能，加上时间比较赶，不少地方都进行了 hardcoding，而实际能投入生产使用的代码必然要求通用性和扩展性，赛后有空会整理出两个分支：一个 highest-qps 追求性能，另一个分支保留下通用性。这次比赛从一个 netty 小白，最终学到了不少的知识点，还是收获很大的，最后感谢一下比赛中给过我指导的各位老哥。

最高 qps 分支：highest-qps

考虑通用性的分支（适合 netty 入门）：master

https://code.aliyun.com/250577914/agent-demo.git

最后帮队友 @闪电侠推广下他的 netty 视频教程，比赛中两个比较难的优化点，都是由他进行的改造。imooc.com 搜索 Netty，可以获取 netty 源码分析视频。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
