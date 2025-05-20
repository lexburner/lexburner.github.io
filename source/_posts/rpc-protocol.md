---
title: 深入理解 RPC 之协议篇
date: 2017-12-28 20:16:28
tags: 
- RPC
categories: RPC
toc: true
---

协议（Protocol）是个很广的概念，RPC 被称为远程过程调用协议，HTTP 和 TCP 也是大家熟悉的协议，也有人经常拿 RPC 和 RESTFUL 做对比，后者也可以被理解为一种协议... 我个人偏向于把“协议”理解为不同厂家不同用户之间的“约定”，而在 RPC 中，协议的含义也有多层。

## Protocol 在 RPC 中的层次关系

翻看 dubbo 和 motan 两个国内知名度数一数二的 RPC 框架（或者叫服务治理框架可能更合适）的文档，他们都有专门的一章介绍自身对多种协议的支持。RPC 框架是一个分层结构，从我的这个《深入理解 RPC》系列就可以看出，是按照分层来介绍 RPC 的原理的，前面已经介绍过了传输层，序列化层，动态代理层，他们各自负责 RPC 调用生命周期中的一环，而协议层则是凌驾于它们所有层之上的一层。简单描述下各个层之间的关系：

> protocol 层主要用于配置 refer（发现服务） 和 exporter（暴露服务） 的实现方式，transport 层定义了传输的方式，codec 层诠释了具体传输过程中报文解析的方式，serialize 层负责将对象转换成字节，以用于传输，proxy 层负责将这些细节屏蔽。
>
> 它们的包含关系如下：protocol > transport > codec > serialize

motan 的 Protocol 接口可以佐证这一点：

```java
public interface Protocol {
    <T> Exporter<T> export(Provider<T> provider, URL url);
    <T> Referer<T> refer(Class<T> clz, URL url, URL serviceUrl);
    void destroy();
}
```

我们都知道 RPC 框架支持多种协议，由于协议处于框架层次的较高位置，任何一种协议的替换，都可能会导致服务发现和服务注册的方式，传输的方式，以及序列化的方式，而不同的协议也给不同的业务场景带来了更多的选择，下面就来看看一些常用协议。

<!-- more -->

## Dubbo 中的协议

### dubbo://

Dubbo 缺省协议采用单一长连接和 NIO 异步通讯，适合于小数据量高并发的服务调用，以及服务消费者机器数远大于服务提供者机器数的情况。

反之，Dubbo 缺省协议不适合传送大数据量的服务，比如传文件，传视频等，除非请求量很低。

适用场景：常规远程服务方法调用

### rmi://

RMI 协议采用 JDK 标准的 `java.rmi.*` 实现，采用阻塞式短连接和 JDK 标准序列化方式。

适用场景：常规远程服务方法调用，与原生 RMI 服务互操作

### hessian://

Hessian 协议用于集成 Hessian 的服务，Hessian 底层采用 Http 通讯，采用 Servlet 暴露服务，Dubbo 缺省内嵌 Jetty 作为服务器实现。

Dubbo 的 Hessian 协议可以和原生 Hessian 服务互操作，即：

- 提供者用 Dubbo 的 Hessian 协议暴露服务，消费者直接用标准 Hessian 接口调用
- 或者提供方用标准 Hessian 暴露服务，消费方用 Dubbo 的 Hessian 协议调用。

Hessian 在之前介绍过，当时仅仅是用它来作为序列化工具，但其本身其实就是一个协议，可以用来做远程通信。

适用场景：页面传输，文件传输，或与原生 hessian 服务互操作

### http://

基于 HTTP 表单的远程调用协议，采用 Spring 的 HttpInvoker 实现

适用场景：需同时给应用程序和浏览器 JS 使用的服务。

### webserivice://

基于 WebService 的远程调用协议，基于 Apache CXF 的 `frontend-simple` 和 `transports-http` 实现。

可以和原生 WebService 服务互操作，即：

- 提供者用 Dubbo 的 WebService 协议暴露服务，消费者直接用标准 WebService 接口调用，
- 或者提供方用标准 WebService 暴露服务，消费方用 Dubbo 的 WebService 协议调用

适用场景：系统集成，跨语言调用

### thrift://

当前 dubbo 支持的 thrift 协议是对 thrift 原生协议的扩展，在原生协议的基础上添加了一些额外的头信息，比如 service name，magic number 等。

### memcached://

基于 memcached 实现的 RPC 协议

### redis://

基于 Redis 实现的 RPC 协议。

> dubbo 支持的众多协议详见 http://dubbo.io/books/dubbo-user-book/references/protocol/dubbo.html



dubbo 的一个分支 [dangdangdotcom/dubbox](https://github.com/dangdangdotcom/dubbox) 扩展了 REST 协议

### rest://

JAX-RS 是标准的 Java REST API，得到了业界的广泛支持和应用，其著名的开源实现就有很多，包括 Oracle 的 Jersey，RedHat 的 RestEasy，Apache 的 CXF 和 Wink，以及 restlet 等等。另外，所有支持 JavaEE 6.0 以上规范的商用 JavaEE 应用服务器都对 JAX-RS 提供了支持。因此，JAX-RS 是一种已经非常成熟的解决方案，并且采用它没有任何所谓 vendor lock-in 的问题。

JAX-RS 在网上的资料非常丰富，例如下面的入门教程：

- Oracle 官方的 tutorial：<http://docs.oracle.com/javaee/7/tutorial/doc/jaxrs.htm>
- IBM developerWorks 中国站文章：<http://www.ibm.com/developerworks/cn/java/j-lo-jaxrs/>

更多的资料请自行 google 或者百度一下。就学习 JAX-RS 来说，一般主要掌握其各种 annotation 的用法即可。

> 注意：dubbo 是基于 JAX-RS 2.0 版本的，有时候需要注意一下资料或 REST 实现所涉及的版本。

适用场景：跨语言调用

千米网也给 dubbo 贡献了一个扩展协议：https://github.com/dubbo/dubbo-rpc-jsonrpc

### jsonrpc://

#### Why HTTP

在互联网快速迭代的大潮下，越来越多的公司选择 nodejs、django、rails 这样的快速脚本框架来开发 web 端应用 而后端的服务用 Java 又是最合适的，这就产生了大量的跨语言的调用需求。
而 http、json 是天然合适作为跨语言的标准，各种语言都有成熟的类库
虽然 Dubbo 的异步长连接协议效率很高，但是在脚本语言中，这点效率的损失并不重要。

#### Why Not RESTful

Dubbox 在 RESTful 接口上已经做出了尝试，但是 REST 架构和 dubbo 原有的 RPC 架构是有区别的，
区别在于 REST 架构需要有资源 (Resources) 的定义， 需要用到 HTTP 协议的基本操作 GET、POST、PUT、DELETE 对资源进行操作。
Dubbox 需要重新定义接口的属性，这对原有的 Dubbo 接口迁移是一个较大的负担。
相比之下，RESTful 更合适互联网系统之间的调用，而 RPC 更合适一个系统内的调用，
所以我们使用了和 Dubbo 理念较为一致的 JsonRPC

[JSON-RPC 2.0 规范](http://www.jsonrpc.org/specification) 和 JAX-RS 一样，也是一个规范，JAVA 对其的支持可参考 [jsonrpc4j](https://github.com/briandilley/jsonrpc4j)

适用场景：跨语言调用

## Motan 中的协议

### motan://

motan 协议之于 motan，地位等同于 dubbo 协议之于 dubbo，两者都是各自默认的且都是自定义的协议。内部使用 netty 进行通信（旧版本使用 netty3 ，最新版本支持 netty4），默认使用 hessian 作为序列化器。

适用场景：常规远程服务方法调用

### injvm://

顾名思义，如果 Provider 和 Consumer 位于同一个 jvm，motan 提供了 injvm 协议。这个协议是 jvm 内部调用，不经过本地网络，一般在服务化拆分时，作为过渡方案使用，可以通过开关机制在本地和远程调用之间进行切换，等过渡完成后再去除本地实现的引用。

### grpc:// 和 yar://

这两个协议的诞生缘起于一定的历史遗留问题，moton 是新浪微博开源的，而其内部有很多 PHP 应用，为解决跨语言问题，这两个协议进而出现了。

适用场景：较为局限的跨语言调用

### restful://

motan 在 [0.3.1](https://github.com/weibocom/motan/tree/0.3.1) (2017-07-11) 版本发布了 restful 协议的支持（和 dubbo 的 rest 协议本质一样），dubbo 默认使用 jetty 作为 http server，而 motan 使用则是 netty 。主要实现的是 java 对 restful 指定的规范，即 javax.ws.rs 包下的类。

适用场景：跨语言调用

### motan2://

motan [1.0.0](https://github.com/weibocom/motan/tree/1.0.0) (2017-10-31)  版本发布了 motan2 协议，用于对跨语言的支持，不同于 restful，jsonrpc 这样的通用协议，motan2 把请求的一些元数据作为单独的部分传输，更适合不同语言解析。

适用场景：跨语言调用

> Motan is a cross-language remote procedure call(RPC) framework for rapid development of high performance distributed services.
>
> [Motan-go](https://github.com/weibocom/motan-go) is golang implementation.
>
> [Motan-PHP](https://github.com/weibocom/motan-php) is PHP client can interactive with Motan server directly or through Motan-go agent.
>
> [Motan-openresty](https://github.com/weibocom/motan-openresty) is a Lua(Luajit) implementation based on [Openresty](http://openresty.org/)

从 motan 的 changeLog 以及 github 首页的介绍来看，其致力于打造成一个跨语言的服务治理框架，这倒是比较亦可赛艇的事。

### 面向未来的协议

motan 已经支持 motan2://，计划支持 mcq://，kafka:// ... 支持更多的协议，以应对复杂的业务场景。对这个感兴趣的朋友，可以参见这篇文章：http://mp.weixin.qq.com/s/XZVCHZZzCX8wwgNKZtsmcA

## 总结

如果仅仅是将 dubbo，motan 作为一个 RPC 框架使用，那大多人会选择其默认的协议（dubbo 协议，motan 协议），而如果是有历史遗留原因，如需要对接异构系统，就需要替换成其他协议了。大多数互联网公司选择自研 RPC 框架，或者改造自己的协议，都是为了适配自身业务的特殊性，协议层的选择非常重要。

