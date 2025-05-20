---
title: Dubbo中的连接控制，你真的理解吗？
toc: true
type: 1
date: 2021-09-07 19:32:26
category:
- RPC
tags:
- Dubbo
---

## 前言

这是一篇很久之前就想动笔写的文章，最近正好看到群里有小伙伴分享了 Dubbo 连接相关的文章，才又让我想起了这个话题。今天想跟大家聊的便是 Dubbo 中的连接控制这一话题。说到“连接控制”，可能有读者还没反应过来，但你对下面的配置可能不会感到陌生：

```xml
<dubbo:reference interface="com.foo.BarService" connections="10" />
```

如果你还不了解 Dubbo 中连接控制的用法，可以参考官方文档：https://dubbo.apache.org/zh/docs/advanced/config-connections/ ，话说最近 Dubbo 官方文档来了一次大换血，好多熟悉的文档差点都没找到在哪儿 Orz。

众所周知，dubbo 协议通信默认是长连接，连接配置功能用于决定消费者与提供者建立的长连接数。但官方文档只给出了该功能的使用方法，却并没有说明什么时候应该配置连接控制，本文将主要围绕该话题进行探讨。

本文也会涉及长连接相关的一些知识点。

<!-- more -->

## 使用方式

先来看一个 Dubbo 构建的简单 demo，启动一个消费者（192.168.4.226）和一个提供者（192.168.4.224），配置他们的直连。

消费者：

```xml
<dubbo:reference id="userService" check="false"
   interface="org.apache.dubbo.benchmark.service.UserService"
   url="dubbo://192.168.4.224:20880"/>
```

提供者：

```xml
<dubbo:service interface="org.apache.dubbo.benchmark.service.UserService" ref="userService" />
<bean id="userService" class="org.apache.dubbo.benchmark.service.UserServiceServerImpl"/>
```

长连接是看不见摸不着的东西，我们需要一个观测性工作来”看到“它。启动提供者和消费者之后，可以使用如下的命令查看 tcp 连接情况

- Mac 下可使用：`lsof -i:20880`
- Linux 下可使用：`netstat -ano | grep 20880`

提供者：

```shell
[root ~]# netstat -ano | grep 20880
tcp6       0      0 192.168.4.224:20880      :::*                    LISTEN      off (0.00/0/0)
tcp6    2502      0 192.168.4.224:20880      192.168.4.226:59100     ESTABLISHED off (0.00/0/0)
```

消费者：

```shell
[root@ ~]# netstat -ano | grep 20880
tcp6     320    720 192.168.4.226:59110     192.168.4.224:20880      ESTABLISHED on (0.00/0/0)
```

通过上述观察到的现象我们可以发现几个事实。

仅仅是启动了提供者和消费者，上述的 TCP 连接就已经存在了，要知道我并没有触发调用。也就是说，Dubbo 建连的默认策略是在地址发现时，而不是在调用时。当然，你也可以通过延迟加载 `lazy="true"` 来修改这一行为，这样可以将建联延迟到调用时。

```xml
<dubbo:reference id="userService" check="false"
    interface="org.apache.dubbo.benchmark.service.UserService"
    url="dubbo://192.168.4.224:20880"
    lazy="true"/>
```
除此之外，还可以发现消费者和提供者之间只有一条长连接，20880 是 Dubbo 提供者默认开放的端口，就跟 tomcat 默认开放的 8080 一个地位，而 59110 是消费者随机生成的一个端口。（我之前跟一些朋友交流过，发现很多人不知道消费者也是需要占用一个端口的）

而今天的主角”连接控制“便可以控制长连接的数量，例如我们可以进行如下的配置

```xml
<dubbo:reference id="userService" check="false"
    interface="org.apache.dubbo.benchmark.service.UserService"
    url="dubbo://192.168.4.224:20880"
    connections="2" />
```

再启动一次消费者，观察长连接情况

提供者：

```shell
[root@ ~]# netstat -ano | grep 20880
tcp6       0      0 192.168.4.224:20880      :::*                    LISTEN      off (0.00/0/0)
tcp6    2508     96 192.168.4.224:20880      192.168.4.226:59436     ESTABLISHED on (0.00/0/0)
tcp6    5016    256 192.168.4.224:20880      192.168.4.226:59434     ESTABLISHED on (0.00/0/0)
```

消费者：

```shell
[root@ ~]# netstat -ano | grep 20880
tcp6       0   2520 192.168.4.226:59436     192.168.4.224:20880      ESTABLISHED on (0.00/0/0)
tcp6      48   1680 192.168.4.226:59434     192.168.4.224:20880      ESTABLISHED on (0.00/0/0)
```

可以看到，这里已经变成两条长连接了。

## 什么时候需要配置多条长连接

现在我们知道了如何进行连接控制，但什么时候我们应该配置多少条长连接呢？这个时候我可以跟你说，具体视生产情况而定，但你如果你经常看我的公众号，肯定会知道这不是我的风格，我的风格是什么？benchmark！

写作之前，我跟几个同事和网友对这个话题进行了简单的讨论，其实也没有什么定论，无非是对单连接和多连接吞吐量高低不同的论调。参考既往 Dubbo github 中的 issue，例如：https://github.com/apache/dubbo/pull/2457，我也参与了这个 pr 的讨论，讲道理，我是持怀疑态度的，我当时的观点是多连接不一定能够提升服务的吞吐量（还是挺保守的，没有这么绝对）。

那接下来，还是用 benchmark 来说话吧，测试工程还是我们的老朋友，使用 Dubbo 官方提供的 dubbo-benchmark 工程。

- 测试工程地址：https://github.com/apache/dubbo-benchmark.git 
- 测试环境：2 台阿里云 Linux  4c8g ECS

测试工程在之前的文章介绍过，这里就不过多赘述了，测试方案也非常简单，两轮 benchmark，分别测试 connections=1 和 connections=2 时，观察测试方法的吞吐量。

说干就干，省略一堆测试步骤，直接给出测试结果。

connections=1

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  22265.286 ± 3060.319  ops/s
Client.existUser   thrpt    3  33129.331 ± 1488.404  ops/s
Client.getUser     thrpt    3  19916.133 ± 1745.249  ops/s
Client.listUser    thrpt    3   3523.905 ±  590.250  ops/s
```

connections=2

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  31111.698 ± 3039.052  ops/s
Client.existUser   thrpt    3  42449.230 ± 2964.239  ops/s
Client.getUser     thrpt    3  30647.173 ± 2551.448  ops/s
Client.listUser    thrpt    3   6581.876 ±  469.831  ops/s
```

从测试结果来看，似乎单连接和多连接的差距是非常大的，近乎可以看做是 2 倍！看起来连接控制的效果真是好呀，那么事实真的如此吗？

按照这种方案第一次测试下来之后，我也不太相信这个结果，因为我之前按照其他方式做过多连接的测试，并且我也参加过第三届中间件挑战赛，使得我对长连接的认知是：大多数时候，单连接往往能发挥出最优的性能。即使由于硬件原因，这个差距也不应该是两倍。怀着这样的疑问，我开始研究，是不是我的测试场景出了什么问题呢？

## 发现测试方案的问题

经过和闪电侠的讨论，他的一席话最终让我定位到了问题的所在。

![闪电侠的对话](https://kirito.iocoder.cn/image-20210907212036374.png)

不知道大家看完我和闪电侠的对话，有没有立刻定位到问题所在。

之前测试方案最大的问题便是没有控制好变量，殊不知：**在连接数变化的同时，实际使用的 IO 线程数实际也发生了变化**。

Dubbo 使用 Netty 来实现长连接通信，提到长连接和 IO 线程的关系，这里就要介绍到 Netty 的连接模型了。一言以蔽之，Netty 的设置 IO worker 线程和 channel 是一对多的绑定关系，即一个 channel 在建连之后，便会完全由一个 IO 线程来负责全部的 IO 操作。再来看看 Dubbo 是如何设置 NettyClient 和 NettyServer 的 worker 线程组的：

客户端 `org.apache.dubbo.remoting.transport.netty4.NettyClient`：

```java
    private static final EventLoopGroup NIO_EVENT_LOOP_GROUP = eventLoopGroup(Constants.DEFAULT_IO_THREADS, "NettyClientWorker");
    
    @Override
    protected void doOpen() throws Throwable {
        final NettyClientHandler nettyClientHandler = new NettyClientHandler(getUrl(), this);
        bootstrap = new Bootstrap();
        bootstrap.group(NIO_EVENT_LOOP_GROUP)
                .option(ChannelOption.SO_KEEPALIVE, true)
                .option(ChannelOption.TCP_NODELAY, true)
                .option(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT);
      ...
    }
```

`Constants.DEFAULT_IO_THREADS` 在 `org.apache.dubbo.remoting.Constants` 中被写死了

```java
int DEFAULT_IO_THREADS = Math.min(Runtime.getRuntime().availableProcessors() + 1, 32);
```

在我的 4c8g 的机器上，默认等于 5。

服务端 `org.apache.dubbo.remoting.transport.netty4.NettyServer`：

```java
protected void doOpen() throws Throwable {
        bootstrap = new ServerBootstrap();

        bossGroup = NettyEventLoopFactory.eventLoopGroup(1, "NettyServerBoss");
        workerGroup = NettyEventLoopFactory.eventLoopGroup(
                getUrl().getPositiveParameter(IO_THREADS_KEY, Constants.DEFAULT_IO_THREADS),
                "NettyServerWorker");

        final NettyServerHandler nettyServerHandler = new NettyServerHandler(getUrl(), this);
        channels = nettyServerHandler.getChannels();

        ServerBootstrap serverBootstrap = bootstrap.group(bossGroup, workerGroup)
        				.channel(NettyEventLoopFactory.serverSocketChannelClass());
								.option(ChannelOption.SO_REUSEADDR, Boolean.TRUE)
                .childOption(ChannelOption.TCP_NODELAY, Boolean.TRUE)
                .childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT);
                
 }
```

服务端倒是可以配置，例如我们可以通过 protocol 来控制服务端的 IO 线程数：

```xml
<dubbo:protocol name="dubbo" host="${server.host}" server="netty4" port="${server.port}" iothreads="5"/>
```

如果不设置，则跟客户端逻辑一致，是 core + 1 个线程。

好了，问题就在这儿，由于我并没有进行任何 IO 线程的设置，所以客户端和服务端都会默认开启 5 个 IO 线程。当 connections=1 时，Netty 会将 channel1 绑定到一个 IO 线程上，而当 connections=2 时，Netty 会将 channel1 和 channel2 按照顺序绑定到 NettyWorkerThread-1和 NettyWorkerThread-2 上，这样就会有两个 IO 线程在工作，这样的测试结果当然是不公平的。

这里需要考虑实际情况，在实际生产中，大多数时候都是分布式场景，连接数一定都是大于 IO 线程数的，所以基本不会出现测试场景中的 channel 数少于 IO 线程数的场景。

解决方案也很简单，我们需要控制变量，让 IO 线程数一致，仅仅观察连接数对吞吐量的影响。针对服务端，可以在 `protocol` 层配置 `iothreads=1`；针对客户端，由于源码被写死了，这里我只能通过修改源码的方式，重新本地打了一个包，使得客户端 IO 线程数也可以通过 -D 参数指定。

改造之后的，我们得到了如下的测试结果：

1 IO 线程 1 连接

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  22265.286 ± 3060.319  ops/s
Client.existUser   thrpt    3  33129.331 ± 1488.404  ops/s
Client.getUser     thrpt    3  19916.133 ± 1745.249  ops/s
Client.listUser    thrpt    3   3523.905 ±  590.250  ops/s
```

1 IO 线程 2 连接

```
Benchmark           Mode  Cnt      Score      Error  Units
Client.createUser  thrpt    3  21776.436 ± 1888.845  ops/s
Client.existUser   thrpt    3  31826.320 ± 1350.434  ops/s
Client.getUser     thrpt    3  19354.470 ±  369.486  ops/s
Client.listUser    thrpt    3   3506.714 ±   18.924  ops/s
```

可以发现，单纯提升连接数并不会提升服务的吞吐量，这样的测试结果也更加符合我认知的预期。

## 总结

从上述测试的结果来看，一些配置参数并不是越大就代表了越好，类似的例子我也在多线程写文件等场景分析过，唯有理论分析+实际测试才能得出值得信服的结论。当然个人的测试，也可能会因为局部性关键信息的遗漏，导致误差，例如，如果我最终没有发现 IO 线程数和连接数之间的隐性关联，很容易就得出连接数和吞吐量成正比的错误结论了。当然，也不一定就代表本文最终的结论是靠谱的，说不定还是不够完善的，也欢迎大家留言，提出意见和建议。

最终回到最初的问题，我们什么时候应该配置 Dubbo 的连接控制呢？按照我个人的经验，大多数时候，生产环境下连接数是非常多的，你可以挑选一台线上的主机，通过 `netstat -ano| grep 20880| wc -l` 来大概统计下，一般是远超 IO 线程数的，没必要再多配置成倍的连接数，连接数和吞吐量并不是一个线性增长的关系。

Dubbo 框架有这个能力和大家真的需要用这个能力完全是两码事，我相信大多数读者应该已经过了技术新鲜感驱动项目的阶段了吧？如果有一天你需要控制连接数，去达到一定特殊的用途，你就会真心感叹，Dubbo 真是强呀，这个扩展点都有。

Dubbo 的连接控制真的完全没有用吗？也不尽然，我的测试场景还是非常有限的，可能在不同硬件上会跑出不一样的效果，例如我在第三届中间件性能挑战赛中，就是用 2 连接跑出了最好的成绩，并非单连接。

最后，你如果仅仅使用 Dubbo 去维系你们的微服务架构，大部分情况不需要关注到连接控制这个特性，多花点时间搬砖吧，就酱，我也去搬砖了。

