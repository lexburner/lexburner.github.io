---
title: 深入理解 RPC 之服务注册与发现篇
date: 2018-01-05 20:16:28
tags: 
- RPC
categories: RPC
---

在我们之前 RPC 原理的分析中，主要将笔墨集中在 Client 和 Server 端。而成熟的服务治理框架中不止存在这两个角色，一般还会有一个 Registry（注册中心）的角色。一张图就可以解释注册中心的主要职责。

![注册中心的地位](https://kirito.iocoder.cn/17071-20170522235215679-280378465.png)

- 注册中心，用于服务端注册远程服务以及客户端发现服务
- 服务端，对外提供后台服务，将自己的服务信息注册到注册中心
- 客户端，从注册中心获取远程服务的注册信息，然后进行远程过程调用

目前主要的注册中心可以借由 zookeeper，eureka，consul，etcd 等开源框架实现。互联网公司也会因为自身业务的特性自研，如美团点评自研的 MNS，新浪微博自研的 vintage。

本文定位是对注册中心有一定了解的读者，所以不过多阐述注册中心的基础概念。

## 注册中心的抽象

借用开源框架中的核心接口，可以帮助我们从一个较为抽象的高度去理解注册中心。例如 motan 中的相关接口：

服务注册接口

```java
public interface RegistryService {
	//1. 向注册中心注册服务
    void register(URL url);
    //2. 从注册中心摘除服务
    void unregister(URL url);
    //3. 将服务设置为可用，供客户端调用
    void available(URL url);
    //4. 禁用服务，客户端无法发现该服务
    void unavailable(URL url);
  	//5. 获取已注册服务的集合
    Collection<URL> getRegisteredServiceUrls();
}
```

服务发现接口

```java
public interface DiscoveryService {
    //1. 订阅服务
    void subscribe(URL url, NotifyListener listener);
    //2. 取消订阅
    void unsubscribe(URL url, NotifyListener listener);
    //3. 发现服务列表
    List<URL> discover(URL url);
}
```

主要使用的方法是 RegistryService#register(URL) 和 DiscoveryService#discover(URL)。其中这个 URL 参数被传递，显然也是很重要的一个类。

```java
public class URL {
    private String protocol;// 协议名称
    private String host;
    private int port;
    // interfaceName, 也代表着路径
    private String path;
    private Map<String, String> parameters;
    private volatile transient Map<String, Number> numbers;
}
```

注册中心也没那么玄乎，其实可以简单理解为：提供一个存储介质，供服务提供者和服务消费者共同连接，而存储的主要信息就是这里的 URL。但是具体 URL 都包含了什么实际信息，我们还没有一个直观的感受。

## 注册信息概览

以元老级别的注册中心 zookeeper 为例，看看它实际都存储了什么信息以及它是如何持久化上一节的 URL。

为了测试，我创建了一个 RPC 服务接口 `com.sinosoft.student.api.DemoApi` , 并且在 6666 端口暴露了这个服务的实现类，将其作为服务提供者。在 6667 端口远程调用这个服务，作为服务消费者。两者都连接本地的 zookeeper，本机 ip 为 192.168.150.1。

使用 zkClient.bash 或者 zkClient.sh 作为客户端连接到本地的 zookeeper，执行如下的命令：

```
[zk: localhost:2181(CONNECTED) 1] ls /motan/demo_group/com.sinosoft.student.api.DemoApi
> [client, server, unavailableServer]
```

zookeeper 有着和 linux 类似的命令和结构，其中 motan，demo_group，com.sinosoft.student.api.DemoApi，client, server, unavailableServer 都是一个个节点。可以从上述命令看出他们的父子关系。

`/motan/demo_group/com.sinosoft.student.api.DemoApi` 的结构为 / 框架标识 / 分组名 / 接口名，其中的分组是 motan 为了隔离不同组的服务而设置的。这样，接口名称相同，分组不同的服务无法互相发现。如果此时有一个分组名为 demo_group2 的服务，接口名称为 DemoApi2，则 motan 会为其创建一个新的节点 `/motan/demo_group2/com.sinosoft.student.api.DemoApi2`

而 client，server，unavailableServer 则就是服务注册与发现的核心节点了。我们先看看这些节点都存储了什么信息。

server 节点：

```
[zk: localhost:2181(CONNECTED) 2] ls /motan/demo_group/com.sinosoft.student.api.DemoApi/server
> [192.168.150.1:6666]

[zk: localhost:2181(CONNECTED) 3] get /motan/demo_group/com.sinosoft.student.api.DemoApi/server/192.168.150.1:6666
> motan://192.168.150.1:6666/com.sinosoft.student.api.DemoApi?serialization=hessian2&protocol=motan&isDefault=true&maxContentLength=1548576&shareChannel=true&refreshTimestamp=1515122649835&id=motanServerBasicConfig&nodeType=service&export=motan:6666&requestTimeout=9000000&accessLog=false&group=demo_group&
```

client 节点：

```
[zk: localhost:2181(CONNECTED) 4] ls /motan/demo_group/com.sinosoft.student.api.DemoApi/client
> [192.168.150.1]
[zk: localhost:2181(CONNECTED) 5] get /motan/demo_group/com.sinosoft.student.api.DemoApi/client/192.168.150.1
> motan://192.168.150.1:0/com.sinosoft.student.api.DemoApi?singleton=true&maxContentLength=1548576&check=false&nodeType=service&version=1.0&throwException=true&accessLog=false&serialization=hessian2&retries=0&protocol=motan&isDefault=true&refreshTimestamp=1515122631758&id=motanClientBasicConfig&requestTimeout=9000&group=demo_group&
```

unavailableServer 节点是一个过渡节点，所以在一切正常的情况下不会存在信息，它的具体作用在下面会介绍。

从这些输出数据可以发现，注册中心承担的一个职责就是存储服务调用中相关的信息，server 向 zookeeper 注册信息，保存在 server 节点，而 client 实际和 server 共享同一个接口，接口名称就是路径名，所以也到达了同样的 server 节点去获取信息。并且同时注册到了 client 节点下（为什么需要这么做在下面介绍）。

## 注册信息详解

### Server 节点

server 节点承担着最重要的职责，它由服务提供者创建，以供服务消费者获取节点中的信息，从而定位到服务提供者真正网络拓扑位置以及得知如何调用。demo 中我只在本机  [192.168.150.1:6666] 启动了一个实例，所以在 server 节点之下，只存在这么一个节点，继续 get 这个节点，可以获取更详细的信息

```
motan://192.168.150.1:6666/com.sinosoft.student.api.DemoApi?serialization=hessian2&protocol=motan&isDefault=true&maxContentLength=1548576&shareChannel=true&refreshTimestamp=1515122649835&id=motanServerBasicConfig&nodeType=service&export=motan:6666&requestTimeout=9000000&accessLog=false&group=demo_group&
```

作为一个 value 值，它和 http 协议的请求十分相似，不过是以 motan:// 开头，表达的意图也很明确，这是 motan 协议和相关的路径及参数，关于 RPC 中的协议，可以翻看我的上一篇文章《深入理解 RPC 之协议篇》。

serialization 对应序列化方式，protocol 对应协议名称，maxContentLength 对应 RPC 传输中数据报文的最大长度，shareChannel 是传输层用到的参数，netty channel 中的一个属性，group 对应分组名称。

上述的 value 包含了 RPC 调用中所需要的全部信息。

### Client 节点

在 motan 中使用 zookeeper 作为注册中心时，客户端订阅服务时会向 zookeeper 注册自身，主要是方便对调用方进行统计、管理。但订阅时是否注册 client 不是必要行为，和不同的注册中心实现有关，例如使用 consul 时便没有注册。

由于我们使用 zookeeper，也可以分析下 zookeeper 中都注册了什么信息。

```
motan://192.168.150.1:0/com.sinosoft.student.api.DemoApi?singleton=true&maxContentLength=1548576&check=false&nodeType=service&version=1.0&throwException=true&accessLog=false&serialization=hessian2&retries=0&protocol=motan&isDefault=true&refreshTimestamp=1515122631758&id=motanClientBasicConfig&requestTimeout=9000&group=demo_group
```

和 Server 节点的值类似，但也有客户独有的一些属性，如 singleton 代表服务是否单例，check 检查服务提供者是否存在，retries 代表重试次数，这也是 RPC 中特别需要注意的一点。

### UnavailableServer 节点 

unavailableServer 节点也不是必须存在的一个节点，它主要用来做 server 端的延迟上线，优雅关机。

延迟上线：一般推荐的服务端启动流程为：server 向注册中心的 unavailableServer 注册，状态为 unavailable，此时整个服务处于启动状态，但不对外提供服务，在服务验证通过，预热完毕，此时打开心跳开关，此时正式提供服务。

优雅关机：当需要对 server 方进行维护升级时，如果直接关闭，则会影响到客户端的请求。所以理想的情况应当是首先切断流量，再进行 server 的下线。具体的做法便是：先关闭心跳开关，客户端感知停止调用后，再关闭服务进程。

## 感知服务的下线

服务上线时自然要注册到注册中心，但下线时也得从注册中心中摘除。注册是一个主动的行为，这没有特别要注意的地方，但服务下线却是一个值得思考的问题。服务下线包含了主动下线和系统宕机等异常方式的下线。

### 临时节点 + 长连接

在 zookeeper 中存在持久化节点和临时节点的概念。持久化节点一经创建，只要不主动删除，便会一直持久化存在；临时节点的生命周期则是和客户端的连接同生共死的，应用连接到 zookeeper 时创建一个临时节点，使用长连接维持会话，这样无论何种方式服务发生下线，zookeeper 都可以感知到，进而删除临时节点。zookeeper 的这一特性和服务下线的需求契合的比较好，所以临时节点被广泛应用。

### 主动下线 + 心跳检测

并不是所有注册中心都有临时节点的概念，另外一种感知服务下线的方式是主动下线。例如在 eureka 中，会有 eureka-server 和 eureka-client 两个角色，其中 eureka-server 保存注册信息，地位等同于 zookeeper。当 eureka-client 需要关闭时，会发送一个通知给 eureka-server，从而让 eureka-server 摘除自己这个节点。但这么做最大的一个问题是，如果仅仅只有主动下线这么一个手段，一旦 eureka-client 非正常下线（如断电，断网），eureka-server 便会一直存在一个已经下线的服务节点，一旦被其他服务发现进而调用，便会带来问题。为了避免出现这样的情况，需要给 eureka-server 增加一个心跳检测功能，它会对服务提供者进行探测，比如每隔 30s 发送一个心跳，如果三次心跳结果都没有返回值，就认为该服务已下线。

## 注册中心对比

| Feature        | Consul            | zookeeper        | etcd            | euerka                |
| -------------- | ----------------- | ---------------- | --------------- | --------------------- |
| 服务健康检查         | 服务状态，内存，硬盘等       | (弱) 长连接，keepalive | 连接心跳            | 可配支持                  |
| 多数据中心          | 支持                | —                | —               | —                     |
| kv 存储服务         | 支持                | 支持               | 支持              | —                     |
| 一致性            | raft              | paxos            | raft            | —                     |
| cap            | ca                | cp               | cp              | ap                    |
| 使用接口 (多语言能力)    | 支持 http 和 dns        | 客户端              | http/grpc       | http（sidecar）         |
| watch 支持        | 全量 / 支持 long polling | 支持               | 支持 long polling | 支持 long polling/ 大部分增量 |
| 自身监控           | metrics           | —                | metrics         | metrics               |
| 安全             | acl /https        | acl              | https 支持（弱）      | —                     |
| spring cloud 集成 | 已支持               | 已支持              | 已支持             | 已支持                   |

一般而言注册中心的特性决定了其使用的场景，例如很多框架支持 zookeeper，在我自己看来是因为其老牌，易用，但业界也有很多人认为 zookeeper 不适合做注册中心，它本身是一个分布式协调组件，并不是为注册服务而生，server 端注册一个服务节点，client 端并不需要在同一时刻拿到完全一致的服务列表，只要最终一致性即可。在跨 IDC，多数据中心等场景下 consul 发挥了很大的优势，这也是很多互联网公司选择使用 consul 的原因。 eureka 是 ap 注册中心，并且是 spring cloud 默认使用的组件，spring cloud eureka 较为贴近 spring cloud 生态。

## 总结

注册中心主要用于解耦服务调用中的定位问题，是分布式系统必须面对的一个问题。更多专业性的对比，可以期待 spring4all.com 的注册中心专题讨论，相信会有更为细致地对比。
