---
title: 一文聊透 Dubbo 优雅上线
date: 2019-11-17 17:25:04
tags:
- Dubbo
categories:
- RPC
toc: true
---

## 1 前言

在此文之前，我写过一篇 《一文聊透 Dubbo 优雅停机》，这篇文章算是一个续集，优雅停机和优雅上线两者都是微服务生命周期中，开发者必须关心的环节。

优雅上线还有很多称呼：「无损上线」，「延迟发布」，「延迟暴露」。它们的对立面自然是：「有损上线」，「直接发布」。

我最近写的「一文聊透 Dubbo xx」系列文章，都有一个特点，即当你不注重文章中实践，你的 Dubbo 应用依旧可以正常运行，但总归在某些场景 case 下，你的系统会出现问题。做不到优雅上线，你的系统将会出现：在应用刚启动时，就有流量进入，而此时应用尚未初始化完毕，导致调用失败，在集群规模较大时，影响会变得很明显。

<!-- more -->

## 2 方案一：延迟发布

以 SpingBoot 下使用 Dubbo 为例，被 Dubbo 的 @Service 注解修饰的服务，会按照 Spring 中初始化 Bean 的顺序，串行执行发布逻辑。Dubbo 框架会完成一系列的操作：

- 创建远程调用的 Proxy
- 把代理对象注册到 ProviderConsumerRegTable，方便远程调用到来时寻找到对应的服务
- 向注册中心注册

一旦服务信息注册到注册中心，在消费者看来该服务就是可以被调用的。然而，此时可能出现一些数据库、缓存资源尚未加载完毕的场景，这取决于你的系统有没有对应的组件，它们何时加载完毕，也完全取决于你的业务。如果你担心你的系统存在这种隐患，可以尝试多次重启集群中的任意一台机器，查看调用方是否存在报错，如果有报错，一种可能性是没有实现优雅停机，一种可能性是没有实现优雅上线。

Dubbo 服务暴露的起点一般是以 Spring 容器启动完毕后发出的 `ContextRefreshedEvent` 事件为准，Dubbo 的 `ServiceBean` 实现了 `ApplicationListener<E extends ApplicationEvent>` 接口，用以接收这一容器刷新事件。

```java
public void onApplicationEvent(ContextRefreshedEvent event) {
    // 是否有延迟导出 && 是否已导出 && 是不是已被取消导出
    if (isDelay() && !isExported() && !isUnexported()) {
        // 导出服务
        export();
    }
}
```

Dubbo 为服务提供了 `delay` 配置：

```xml
<dubbo:service delay="5000" />
```

如上配置后，Dubbo 服务将会在 Spring 容器启动后 5s，再执行暴露逻辑。这里 delay 的时长，取决于你系统资源初始化的耗时，没有一个经验值。如果不配置改值，Dubbo 将会在收到 `ContextRefreshedEvent` 事件后，立即执行发布逻辑。

> Dubbo 2.6.5 版本对服务延迟发布逻辑进行了细微的调整，将需要延迟暴露（delay > 0）服务的倒计时动作推迟到了 Spring 初始化完成后进行。在此之前的版本的逻辑不太合理，如果想要让 2.6.5 之前的版本延迟到 Spring 初始化完成后，再暴露服务，可以这样配置：<dubbo:service delay="-1" />

> 本节参考 Dubbo 官方文档
>
> 延迟暴露：http://dubbo.apache.org/zh-cn/docs/user/demos/delay-publish.html

## 3 方案二：QOS 命令上线

Dubbo 还为服务提供了另一个配置项：

```xml
<dubbo:service register="false" />
```

该配置项配置后，服务将不会发布到注册中心，可能很多 Dubbo 用户不会注意到这个配置，它的作用恰恰是 QOS 指令使用的。

Dubbo 2.5.8 及以上的版本，还提供了一些在线运维命令。为了演示该命令，我们准备一个 `GreetingService` 的 demo：

```java
public class DubboProvider {

    public static void main(String[] args) throws Exception {
        ServiceConfig<GreetingsService> service = new ServiceConfig<>();
        service.setApplication(new ApplicationConfig("dubbo-provider"));
        service.setRegistry(new RegistryConfig("nacos://127.0.0.1:8848"));
        service.setInterface(GreetingsService.class);
        service.setRef(new GreetingsServiceImpl());
        service.setRegister(false);
        service.export();

        System.out.println("dubbo service started");
        new CountDownLatch(1).await();
    }
}
```

注意我们配置了不发布：`service.setRegister(false)`，由于 QOS 配置是默认打开的，在本地的 22222 端口，可以进入 QOS 控制台。

```
 krito git:(master) ✗ telnet localhost 22222
Trying ::1...
Connected to localhost.
Escape character is '^]'.
   ___   __  __ ___   ___   ____     
  / _ \ / / / // _ ) / _ ) / __ \  
 / // // /_/ // _  |/ _  |/ /_/ /    
/____/ \____//____//____/ \____/   
dubbo>ls
As Provider side:
+-------------------------------------+---+
|        Provider Service Name        |PUB|
+-------------------------------------+---+
|com.alibaba.edas.api.GreetingsService| N |
+-------------------------------------+---+
As Consumer side:
+---------------------+---+
|Consumer Service Name|NUM|
+---------------------+---+

dubbo>online  
OK
dubbo>ls
As Provider side:
+-------------------------------------+---+
|        Provider Service Name        |PUB|
+-------------------------------------+---+
|com.alibaba.edas.api.GreetingsService| Y |
+-------------------------------------+---+
As Consumer side:
+---------------------+---+
|Consumer Service Name|NUM|
+---------------------+---+

dubbo>

```

如上图所示，我们首先查看到 `com.alibaba.edas.api.GreetingsService` 服务是未发布的，通过 online 命令手动将服务发布，再使用 `ls` 查看服务列表时，已经显示服务处于发布状态了。

除了使用 telnet，还可以通过 HTTP 访问：

```
curl localhost:22222/online
```

小 tips：在使用 SpringBoot 注解式声明一个 Service 时，register 属性会失效，在 xml 或者 API 方式下声明则运行正常，怀疑是 dubbo-spring-boot-starter 的一个 bug。

![image-20191117205139227](https://kirito.iocoder.cn/image-20191117205139227.png)

![image-20191117205207044](https://kirito.iocoder.cn/image-20191117205207044.png)

大家在 SpringBoot 下使用 Dubbo 需要留意类似的问题，之前有过一些属性在 SpringBoot 注解中未解析或为提供注解配置的案例，在使用时需要注意。

> 本节参考 Dubbo 官方文档
>
> 服务配置说明：http://dubbo.apache.org/zh-cn/docs/user/references/xml/dubbo-service.html
>
> QOS：http://dubbo.apache.org/zh-cn/docs/user/references/qos.html

## 最佳实践

本文介绍了两种 Dubbo 的机制：

- 方案一：延迟发布（delay=5000）
- 方案二：不发布 + QOS 指令发布（register=false）

想要实现优雅上线，可以采取适合你系统的方式。方案一延迟发布的优势在于实现简单，但具体 delay 多少秒，比较依赖系统维护者的经验。方案二使用 QOS 指令，一般依靠于发布系统，当发布系统检测到固定的资源加载完毕这样一个信号时，自动触发上线命令，更加灵活。

当你系统遇到应用启动时流量有所损失时，就应该考虑一下优雅上线的问题了，更多 Dubbo 使用的注意点，请持续关注公众号。



![img](https://www.cnkirito.moe/css/images/wechat_public.jpg)

*「技术分享」**某种程度上，是让作者和读者，不那么孤独的东西。**欢迎关注我的微信公众号：**「**Kirito的技术分享」*
