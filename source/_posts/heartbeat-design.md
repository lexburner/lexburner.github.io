---
title: 一种心跳，两种设计
date: 2019-01-12 06:24:09
tags:
- TCP
- 心跳
categories:
- RPC
---

### 前言

在前一篇文章《**聊聊 TCP 长连接和心跳那些事**》中，我们已经聊过了 TCP 中的 KeepAlive，以及在应用层设计心跳的意义，但却对长连接心跳的设计方案没有做详细地介绍。事实上，设计一个好的心跳机制并不是一件容易的事，就我所熟知的几个 RPC 框架：Dubbo，Motan，HSF（阿里内部的 RPC 框架），它们的心跳机制可以说大相径庭，这篇文章我将跟大家探讨一下**如何设计一个优雅的心跳机制，主要从 Dubbo 和 HSF 的实现来做分析**。

<!-- more -->

### 预备知识

因为后续我们将从源码层面来进行介绍，所以一些服务治理框架的细节还需要提前交代一下，方便大家理解。

#### 客户端如何得知请求失败了？

高性能的 RPC 框架几乎都会选择使用 Netty 来作为通信层的组件，非阻塞式通信的高效不需要我做过多的介绍。但也由于非阻塞的特性，导致其发送数据和接收数据是一个异步的过程，所以当存在服务端异常、网络问题时，客户端接是接收不到响应的，那我们如何判断一次 RPC 调用是失败的呢？

误区一：Dubbo 调用不是默认同步的吗？

Dubbo 在通信层是异步的，呈现给使用者同步的错觉是因为内部做了阻塞等待，实现了异步转同步。

误区二： `Channel.writeAndFlush` 会返回一个 `channelFuture`，我只需要判断 `channelFuture.isSuccess` 就可以判断请求是否成功了。

注意，writeAndFlush 成功并不代表对端接受到了请求，返回值为 true 只能保证写入网络缓冲区成功，并不代表发送成功。

避开上述两个误区，我们再来回到本小节的标题：客户端如何得知请求失败？**正确的逻辑应当是以客户端接收到失败响应为判断依据**。等等，前面不还在说在失败的场景中，服务端是不会返回响应的吗？没错，既然服务端不会返回，那就只能客户端自己造了。

一个常见的设计是：客户端发起一个 RPC 请求，会设置一个超时时间 `client_timeout`，发起调用的同时，客户端会开启一个延迟 `client_timeout` 的定时器

- 接收到正常响应时，移除该定时器。
- 定时器倒计时完毕，还没有被取消，则任务请求超时，构造一个失败的响应传递给客户端。

Dubbo 中的超时判定逻辑：

```java
public static DefaultFuture newFuture(Channel channel, Request request, int timeout) {
    final DefaultFuture future = new DefaultFuture(channel, request, timeout);
    // timeout check
    timeoutCheck(future);
    return future;
}
private static void timeoutCheck(DefaultFuture future) {
    TimeoutCheckTask task = new TimeoutCheckTask(future);
    TIME_OUT_TIMER.newTimeout(task, future.getTimeout(), TimeUnit.MILLISECONDS);
}
private static class TimeoutCheckTask implements TimerTask {
    private DefaultFuture future;
    TimeoutCheckTask(DefaultFuture future) {
        this.future = future;
    }
    @Override
    public void run(Timeout timeout) {
        if (future == null || future.isDone()) {
            return;
        }
        // create exception response.
        Response timeoutResponse = new Response(future.getId());
        // set timeout status.
        timeoutResponse.setStatus(future.isSent() ? Response.SERVER_TIMEOUT : Response.CLIENT_TIMEOUT);
        timeoutResponse.setErrorMessage(future.getTimeoutMessage(true));
        // handle response.
        DefaultFuture.received(future.getChannel(), timeoutResponse);
    }
}

```

主要逻辑涉及的类：`DubboInvoker`，`HeaderExchangeChannel`，`DefaultFuture` ，通过上述代码，我们可以得知一个细节，无论是何种调用，都会经过这个定时器的检测，**超时即调用失败，一次 RPC 调用的失败，必须以客户端收到失败响应为准**。

#### 心跳检测需要容错

网络通信永远要考虑到最坏的情况，一次心跳失败，不能认定为是连接不通，多次心跳失败，我们才能采取相应的措施。

#### 心跳检测不需要忙检测

忙检测的对立面是空闲检测，我们做心跳的初衷，是为了保证连接的可用性，以保证及时采取断连，重连等措施。如果一条通道上有频繁的 RPC 调用正在进行，我们不应该为通道增加负担去发送心跳包。**心跳扮演的角色应当是晴天收伞，雨天送伞。**

###Dubbo

> 本文的源码对应 Dubbo  2.7.x 版本，在 apache 孵化的该版本中，心跳机制得到了增强。

介绍完了一些基础的概念，我们便来看看 Dubbo 是如何设计应用层心跳的。

#### 连接建立时创建定时器

```java
public class HeaderExchangeClient implements ExchangeClient {
    private int heartbeat;
    private int heartbeatTimeout;
    private HashedWheelTimer heartbeatTimer;
    public HeaderExchangeClient(Client client, boolean needHeartbeat) {
        this.client = client;
        this.channel = new HeaderExchangeChannel(client);
        this.heartbeat = client.getUrl().getParameter(Constants.HEARTBEAT_KEY, dubbo != null && dubbo.startsWith("1.0.") ? Constants.DEFAULT_HEARTBEAT : 0);
        this.heartbeatTimeout = client.getUrl().getParameter(Constants.HEARTBEAT_TIMEOUT_KEY, heartbeat * 3);
        if (needHeartbeat) { <1>
            long tickDuration = calculateLeastDuration(heartbeat);
            heartbeatTimer = new HashedWheelTimer(new NamedThreadFactory("dubbo-client-heartbeat", true), tickDuration,
                    TimeUnit.MILLISECONDS, Constants.TICKS_PER_WHEEL); <2>
            startHeartbeatTimer();
        }
    }
 }
```

<1> 默认开启心跳检测的定时器

<2> 创建了一个 `HashWheelTimer` 开启心跳检测，这是 Netty 所提供的一个经典的时间轮定时器实现，至于它和 jdk 的实现有何不同，不了解的同学也可以关注下，我就不扯了。

不仅 `HeaderExchangeClient` 客户端开起了定时器，`HeaderExchangeServer` 服务端同样开起了定时器，由于服务端的逻辑和客户端几乎一致，所以后续我并不会重复粘贴服务端的代码。

> dubbo 在早期版本版本中使用的是 shedule 方案，出于性能考虑，替换成了 HashWheelTimer。

#### 开启两个定时任务

```java
private void startHeartbeatTimer() {
    long heartbeatTick = calculateLeastDuration(heartbeat);
    long heartbeatTimeoutTick = calculateLeastDuration(heartbeatTimeout);
    HeartbeatTimerTask heartBeatTimerTask = new HeartbeatTimerTask(cp, heartbeatTick, heartbeat); <1>
    ReconnectTimerTask reconnectTimerTask = new ReconnectTimerTask(cp, heartbeatTimeoutTick, heartbeatTimeout); <2>

    heartbeatTimer.newTimeout(heartBeatTimerTask, heartbeatTick, TimeUnit.MILLISECONDS);
    heartbeatTimer.newTimeout(reconnectTimerTask, heartbeatTimeoutTick, TimeUnit.MILLISECONDS);
}
```

Dubbo 在 `startHeartbeatTimer` 方法中主要开启了两个定时器： `HeartbeatTimerTask`，`ReconnectTimerTask` 

<1> `HeartbeatTimerTask` 主要用于定时发送心跳请求

<2> `ReconnectTimerTask`  主要用于心跳失败之后处理重连，断连的逻辑

至于方法中的其他代码，其实也是本文的重要分析内容，先容我卖个关子，后面再来看追溯。

#### 定时任务一：发送心跳请求

详细解析下心跳检测定时任务的逻辑 `HeartbeatTimerTask#doTask`：

```java
protected void doTask(Channel channel) {
    Long lastRead = lastRead(channel);
    Long lastWrite = lastWrite(channel);
    if ((lastRead != null && now() - lastRead > heartbeat)
        || (lastWrite != null && now() - lastWrite > heartbeat)) {
            Request req = new Request();
            req.setVersion(Version.getProtocolVersion());
            req.setTwoWay(true);
            req.setEvent(Request.HEARTBEAT_EVENT);
            channel.send(req);
            if (logger.isDebugEnabled()) {
                logger.debug("Send heartbeat to remote channel " + channel.getRemoteAddress() + ", cause: The channel has no data-transmission exceeds a heartbeat period: " + heartbeat + "ms");
            }
        }
    }
}
```

前面已经介绍过，Dubbo 采取的是设计是双向心跳，即服务端会向客户端发送心跳，客户端也会向服务端发送心跳，接收的一方更新 lastRead 字段，发送的一方更新 lastWrite 字段，超过心跳间隙的时间，便发送心跳请求给对端。这里的 lastRead/lastWrite 同样会被同一个通道上的普通调用更新，通过更新这两个字段，实现了只在连接空闲时才会真正发送空闲报文的机制，符合我们一开始科普的做法。

> 注意：不仅仅心跳请求会更新 lastRead 和 lastWrite，普通请求也会。这对应了我们预备知识中的空闲检测机制。

#### 定时任务二：处理重连和断连

继续研究下重连和断连定时器都实现了什么 `ReconnectTimerTask#doTask`。

```java
protected void doTask(Channel channel) {
    Long lastRead = lastRead(channel);
    Long now = now();
    if (lastRead != null && now - lastRead > heartbeatTimeout) {
        if (channel instanceof Client) {
            ((Client) channel).reconnect();
        } else {
            channel.close();
        }
    }
}
```

第二个定时器则负责根据客户端、服务端类型来对连接坐不同的处理，当超过设置的心跳总时间之后，客户端选择的是重新连接，服务端则是选择直接断开连接。这样的考虑是合理的，客户端调用是强依赖可用的连接的，而服务端可以等待客户端重新建立连接。

> 细心的朋友会发现，这个类被命名为 ReconnectTimerTask 是不太准确的，因为它处理的是重连和断连两个逻辑。

#### 定时不精确的问题

在 Dubbo 的 issue 中曾经有人反馈过定时不精确的问题，我们来看看是怎么一回事。

Dubbo 中默认的心跳周期是 60s，设想如下的时序：

- 第 0 秒，心跳检测发现连接活跃
- 第 1 秒，连接实际断开
- 第 60 秒，心跳检测发现连接不活跃

由于时间窗口的问题，死链不能够被及时检测出来，最坏情况为一个心跳周期。

为了解决上述问题，我们再倒回去看一下上面的 `startHeartbeatTimer()` 方法

```java
long heartbeatTick = calculateLeastDuration(heartbeat); 
long heartbeatTimeoutTick = calculateLeastDuration(heartbeatTimeout);
```

其中 `calculateLeastDuration` 根据心跳时间和超时时间分别计算出了一个 tick 时间，实际上就是将 两个变量除以了 3，将他们的值缩小，并传入了 HashWeelTimer 的第二个参数之中

```java
heartbeatTimer.newTimeout(heartBeatTimerTask, heartbeatTick, TimeUnit.MILLISECONDS);
heartbeatTimer.newTimeout(reconnectTimerTask, heartbeatTimeoutTick, TimeUnit.MILLISECONDS);
```

tick 的含义便是定时任务执行的频率。这样，通过减少检测间隔时间，增大了及时发现死链的概率，原来的最坏情况是 60s，如今变成了 20s。

> 定时不准确的问题出现在 Dubbo 的两个定时任务之中，所以都做了 tick 操作。事实上，所有的定时检测的逻辑都存在类似的问题。

#### Dubbo 心跳总结

Dubbo 对于建立的每一个连接，同时在客户端和服务端开启了 2 个定时器，一个用于定时发送心跳，一个用于定时重连、断连，执行的频率均为各自检测周期的 1/3。定时发送心跳的任务负责在连接空闲时，向对端发送心跳包。定时重连、断连的任务负责检测 lastRead 是否在超时周期内仍未被更新，如果判定为超时，客户端处理的逻辑是重连，服务端则采取断连的措施。

先不急着判断这个方案好不好，再来看看 HSF 是怎么设计的。

### HSF

#### IdleStateHandler 介绍



#### 客户端和服务端的配置



#### 客户端单向发送心跳



#### 服务端单向关闭连接



### 心跳设计方案对比



### Dubbo 建议的改进方案



**欢迎关注我的微信公众号：「Kirito的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)