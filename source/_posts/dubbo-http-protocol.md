---
title: Dubbo 中的 http 协议
date: 2019-07-16 19:13:06
tags:
- Dubbo
categories:
- RPC
---

太阳红彤彤，花儿五颜六色，各位读者朋友好，又来到了分享 Dubbo 知识点的时候了。说到 Dubbo 框架支持的协议，你的第一反应是什么？大概会有 Dubbo 默认支持的 dubbo 协议，以及老生常谈的由当当贡献给 Dubbo 的     rest 协议，或者是今天的主角 http。截止到目前，Dubbo 最新版本演进到了 2.7.3，已经支持了：dubbo，hessain，http，injvm，jsonrpc，memcached，native-thrift，thrift，redis，rest，rmi，webservice，xml 等协议，有些协议的使用方式还没有补全到官方文档中。原来 Dubbo 支持这么多协议，是不是有点出乎你的意料呢？

这么多 RPC 协议，可能有人会产生如下的疑问：rest，jsonrpc，webservice 不都是依靠 http 通信吗？为什么还单独有一个 http 协议？先不急着回答这个问题，而是引出今天的话题，先来介绍下 Dubbo 框架中所谓的 http 协议。

<!-- more -->

## Dubbo 中的 http 协议

在 Dubbo 使用 http 协议和其他协议基本一样，只需要指定 protocol 即可。

```xml
<dubbo:protocol name="http" port="8080" server="jetty" />
```

server 属性可选值：jetty，tomcat，servlet。

配置过后，当服务消费者向服务提供者发起调用，底层便会使用标准的 http 协议进行通信。可以直接在 https://github.com/apache/dubbo-samples 中找到官方示例，其中的子模块：dubbo-samples-http 构建了一个 http 协议调用的例子。

> 为避免大家误解，特在此声明：本文中，所有的 http 协议特指的是 dubbo 中的 http 协议，并非那个大家耳熟能详的通用的 http 协议。

## http 协议的底层原理

从默认的 dubbo 协议改为 http 协议是非常简单的一件事，上面便是使用者视角所看到的全部的内容了，接下来我们将会探讨其底层实现原理。

翻看 Dubbo 的源码，找到 HttpProtocol 的实现，你可能会吃惊，基本就依靠 HttpProtocol 一个类，就实现了 http 协议

![image-20190717185724385](https://kirito.iocoder.cn/image-20190717185724385.png)

要知道实现自定义的 dubbo 协议，有近 30 个类！http 协议实现的如此简单，背后主要原因有两点：

1. remoting 层使用 http 通信，不需要自定义编解码
2. 借助了 Spring 提供的 HttpInvoker 封装了 refer 和 exporter 的逻辑

Spring 提供的 HttpInvoker 是何方神圣呢？的确是一个比较生僻的概念，但并不复杂，简单来说，就是使用 Java 序列化将对象转换成字节，通过 http 发送出去，在 server 端，Spring 能根据 url 映射，找到容器中对应的 Bean 反射调用的过程，没见识过它也不要紧，可以通过下面的示例快速掌握这一概念。

## Spring HttpInvoker

> 本节内容可参见 Spring 文档：https://docs.spring.io/spring/docs/4.3.24.RELEASE/spring-framework-reference/htmlsingle/#remoting-httpinvoker-server

下面的示例将会展示如何使用 Spring 原生的 HttpInvoker 实现远程调用。

### 创建服务提供者

```java
public class AccountServiceImpl implements AccountService {
    @Override
    public Account findById(int id) {
        Account account = new Account(id, new Date().toString());
        return account;
    }
}
```

```java
@Bean
AccountService accountService(){
    return new AccountServiceImpl();
}

@Bean("/AccountService")
public HttpInvokerServiceExporter accountServiceExporter(AccountService accountService){
    HttpInvokerServiceExporter exporter = new HttpInvokerServiceExporter();
    exporter.setService(accountService);
    exporter.setServiceInterface(AccountService.class);
    return exporter;
}
```

暴露服务的代码相当简单，需要注意两点：

1. `org.springframework.remoting.httpinvoker.HttpInvokerServiceExporter` 是 Spring 封装的一个服务暴露器，它会以 serviceInterface 为公共接口，以 service 为实现类向外提供服务。
2. @Bean("/AccountService") 不仅仅指定了 IOC 容器中 bean 的名字，还充当了路径映射的功能，如果本地服务器暴露在 8080 端口，则示例服务的访问路径为 `http://localhost:8080/AccountService`

### 创建服务消费者

```java
@Configuration
public class HttpProxyConfig {
    @Bean("accountServiceProxy")
    public HttpInvokerProxyFactoryBean accountServiceProxy(){
        HttpInvokerProxyFactoryBean accountService = new HttpInvokerProxyFactoryBean();
        accountService.setServiceInterface(AccountService.class);
        accountService.setServiceUrl("http://localhost:8080/AccountService");
        return accountService;
    }
}
```

```java
@SpringBootApplication
public class HttpClientApp {
    public static void main(String[] args) {
        ConfigurableApplicationContext applicationContext = SpringApplication.run(HttpClientApp.class, args);
        AccountService accountService = applicationContext.getBean(AccountService.class);
        System.out.println(accountService.findById(10086));
    }
}
```

消费者端引用服务同样有两个注意点：

1. `org.springframework.remoting.httpinvoker.HttpInvokerProxyFactoryBean`  是 Spring 封装的一个服务引用器，serviceInterface 指定了生成代理的接口，serviceUrl 指定了服务所在的地址，与之前配置的服务暴露者的路径需要对应。
2. HttpInvokerProxyFactoryBean 注册到容器之中时，会同时生成一个 AccountService 接口的代理类，由 Spring 封装远程调用的逻辑。

### 调用细节分析

对于 Spring HttpInvoker 的底层实现，就没必要深究了，但大家肯定还是会好奇一些细节：dubbo 中的 http 报文体是怎么组织的？如何序列化对象的？

我们使用 wireshark 可以抓取到客户端发送的请求以及服务端响应的报文。

![image-20190717193241396](https://kirito.iocoder.cn/image-20190717193241396.png)

追踪报文流，可以看到详细的请求和响应内容

![image-20190717193339739](https://kirito.iocoder.cn/image-20190717193339739.png)

从 `ContentType: application/x-java-serialized-object` 和报文 Body 部分的 ASCII 码可以看出，使用的是 Java Serialize 序列化。我们将 Body 部分导出成文件，使用 Java Serialize 反序列化响应，来验证一下它的庐山真面目：

![image-20190717194908741](https://kirito.iocoder.cn/image-20190717194908741.png)

使用 Java Serialize 可以正常反序列化报文，得到结果是 Spring 内置的包装类 RemoteInvocationResult，里面装饰着实际的业务返回结果。

## http 协议的意义

Dubbo 提供的众多协议有各自适用的场景，例如

- dubbo://，dubbo 协议是默认的协议，自定义二进制协议；单个长连接节省资源；基于 tcp，架构于 netty 之上，性能还算可以；协议设计上没有足够的前瞻性，不适合做 service-mesh 谈不上多么优雅，但是好歹风风雨雨用了这么多年，周边也有不少配套组件例如 dubbo2.js, dubbo-go, dubbo-cpp，一定程度解决了多语言的问题。
- webservice://,hession://,thrift:// 等协议，基本是为了适配已有协议的服务端 / 客户端，借助于 dubbo 框架的 api，可以使用其功能特性，意义不是特别大。
- redis://,memcached:// 等协议，并非是暴露给用户配置的协议，一般是 dubbo 自用，在注册中心模块中会使用到相应的扩展

所有协议的具体使用场景和其特性，我可能会单独写文章来分析，而如今我们要思考的是 dubbo 提供 http 协议到底解决什么问题，什么场景下用户会考虑使用 dubbo 的 http 协议。

我个人认为 dubbo 现如今的 http 协议比较鸡肋，原生 http 通信的优势在于其通用性，基本所有语言都有配套的 http 客户端和服务端支持，但是 dubbo 的 http 协议却使用了 `application/x-java-serialized-object` 的格式来做为默认的 payload，使得其丧失了跨语言的优势。可能有读者会反驳：HttpInvoker 支持配置序列化格式，不能这么草率的诟病它。但其实我们所关注的恰恰是默认实现，正如 dubbo:// 协议也可以配置 fastjson 作为序列化方案，但是我们同样不认为 dubbo:// 协议是一个优秀的跨语言方案，理由是一样的。当然，评价一个应用层协议是否是优秀的，是否适合做 mesh 等等，需要多种方向去分析，这些我不在本文去分析。

说到底，本文花了一定的篇幅向大家介绍了 dubbo 的 http 协议，到头来却是想告诉你：这是一个比较鸡肋的协议，是不是有些失望呢？不要失望，dubbo 可能在 2.7.4 版本废弃现有的 http 协议，转而使用 jsonrpc 协议替代，其实也就是将 jsonrpc 协议换了个名字而已，而关于 jsonrpc 的细节，我将会在下一篇文章中介绍，届时，我也会分析，为什么 jsonrpc 比现有的 http 协议更适合戴上 http 协议的帽子，至于现有的 http 协议，我更倾向于称之为：spring-httpinvoker 协议。

总结，dubbo 现有 http 协议的意义是什么？如果你习惯于使用 Spring HttpInvoker，那或许现有的 http 协议还有一定的用处，但从 dubbo 交流群和 Spring 文档介绍其所花费的篇幅来看，它还是非常小众的。同时也可以让我们更好地认识协议发展的历史，知道一个协议为什么存在，为什么会被淘汰。

当然，我说了不算，最终还是要看 dubbo 社区的决策，如果你对这个迁移方案感兴趣，想要参与讨论，欢迎大家在 dubbo 社区的邮件列表中发表你的见解

Topic：[Proposal] replace the protocol="http" with protocol="jsonrpc"



** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
