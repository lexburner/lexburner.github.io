---
title: 一文聊透 Dubbo 优雅停机
date: 2019-09-29 22:46:55
tags:
- Dubbo
categories:
- RPC
toc: true
---

## 1 前言

一年之前，我曾经写过一篇《研究优雅停机时的一点思考》，主要介绍了 kill -9，kill -15 两个 Linux 指令的含义，并且针对性的聊到了 Spring Boot 应用如何正确的优雅停机，算是本文的前置文章，如果你对上述概念不甚了解，建议先去浏览一遍，再回头来看这篇文章。这篇文章将会以 Dubbo 为例，既聊架构设计，也聊源码，聊聊服务治理框架要真正实现优雅停机，需要注意哪些细节。

本文的写作思路是从 Dubbo 2.5.x 开始，围绕优雅停机这个优化点，一直追溯到最新的 2.7.x。先对 Dubbo 版本做一个简单的科普：2.7.x 和 2.6.x 是目前官方推荐使用的版本，其中 2.7.x 是捐献给 Apache 的版本，具备了很多新的特性，目前最新的 release 版本是 2.7.4，处于生产基本可用的状态；2.6.x 处于维护态，主要以 bugfix 为主，但经过了很多公司线上环境的验证，所以求稳的话，可以使用 2.6.x 分支最新的版本。至于 2.5.x，社区已经放弃了维护，并且 2.5.x 存在一定数量的 bug，本文介绍的 Dubbo 优雅停机特性便体现了这一点。

<!-- more -->

## 2 优雅停机的意义

优雅停机一直是一个非常严谨的话题，但由于其仅仅存在于重启、下线这样的部署阶段，导致很多人忽视了它的重要性，但没有它，你永远不能得到一个完整的应用生命周期，永远会对系统的健壮性持怀疑态度。

同时，优雅停机又是一个庞大的话题

- 操作系统层面，提供了 kill -9 （SIGKILL）和 kill -15（SIGTERM） 两种停机策略
- 语言层面，Java 应用有 JVM shutdown hook 这样的概念
- 框架层面，Spring Boot 提供了 actuator 的下线 endpoint，提供了 ContextClosedEvent 事件
- 容器层面，Docker ：当执行 docker stop 命令时，容器内的进程会收到 SIGTERM 信号，那么 Docker Daemon 会在 10s 后，发出 SIGKILL 信号；K8S 在管理容器生命周期阶段中提供了 prestop 钩子方法
- 应用架构层面，不同架构存在不同的部署方案。单体式应用中，一般依靠 nginx 这样的负载均衡组件进行手动切流，逐步部署集群；微服务架构中，各个节点之间有复杂的调用关系，上述这种方案就显得不可靠了，需要有自动化的机制。

为避免该话题过度发散，本文的重点将会集中在框架和应用架构层面，探讨以 Dubbo 为代表的微服务架构在优雅停机上的最佳实践。Dubbo 的优雅下线主要依赖于注册中心组件，由其通知消费者摘除下线的节点，如下图所示：

![image-20191001173747692](https://image.cnkirito.cn/image-20191001173747692.png)

上述的操作旨在让服务消费者避开已经下线的机器，但这样就算实现了优雅停机了吗？似乎还漏掉了一步，在应用停机时，可能还存在执行到了一半的任务，试想这样一个场景：一个 Dubbo 请求刚到达提供者，服务端正在处理请求，收到停机指令后，提供者直接停机，留给消费者的只会是一个没有处理完毕的超时请求。

结合上述的案例，我们总结出 Dubbo 优雅停机需要满足两点基本诉求：

1. 服务消费者不应该请求到已经下线的服务提供者
2. 在途请求需要处理完毕，不能被停机指令中断

优雅停机的意义：应用的重启、停机等操作，不影响业务的连续性。

## 3 优雅停机初始方案 — 2.5.x

为了让读者对 Dubbo 的优雅停机有一个最基础的理解，我们首先研究下 Dubbo 2.5.x 的版本，这个版本实现优雅停机的方案相对简单，容易理解。

### 3.1 入口类：AbstractConfig

```java
public abstract class AbstractConfig implements Serializable {
	static {
        Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
            public void run() {
                ProtocolConfig.destroyAll();
            }
        }, "DubboShutdownHook"));
    }
}
```

在 AbstractConfig 的静态块中，Dubbo 注册了一个 shutdown hook，用于执行 Dubbo 预设的一些停机逻辑，继续跟进 `ProtocolConfig.destroyAll()` 。

### 3.2 ProtocolConfig

```java
public static void destroyAll() {
    if (!destroyed.compareAndSet(false, true)) {
        return;
    }
    AbstractRegistryFactory.destroyAll(); // ①注册中心注销

    // Wait for registry notification
    try {
        Thread.sleep(ConfigUtils.getServerShutdownTimeout()); // ② sleep 等待
    } catch (InterruptedException e) {
        logger.warn("Interrupted unexpectedly when waiting for registry notification during shutdown process!");
    }

    ExtensionLoader<Protocol> loader = ExtensionLoader.getExtensionLoader(Protocol.class);
    for (String protocolName : loader.getLoadedExtensions()) {
        try {
            Protocol protocol = loader.getLoadedExtension(protocolName);
            if (protocol != null) {
                protocol.destroy(); // ③协议/流程注销
            }
        } catch (Throwable t) {
            logger.warn(t.getMessage(), t);
        }
    }
}
```

Dubbo 中的 `Protocol` 这个词不太能望文生义，它一般被翻译为"协议"，但我更习惯将它理解为“流程”，从 `Protocol` 接口的三个方法反而更加容易理解。

```java
public interface Protocol {
    <T> Exporter<T> export(Invoker<T> invoker) throws RpcException;
    <T> Invoker<T> refer(Class<T> type, URL url) throws RpcException;
    void destroy();
}
```

它定义了暴露、订阅、注销这三个生命周期方法，所以不难理解为什么 Dubbo 会把 shutdown hook 触发后的注销方法定义在 `ProtocolConfig` 中了。

回到 `ProtocolConfig` 的源码中，我把 `ProtocolConfig` 中执行的优雅停机逻辑分成了三部分，其中第 1，2 部分和注册中心（Registry）相关，第 3 部分和协议/流程（Protocol）相关，分成下面的 3.3 和 3.4 两部分来介绍。

### 3.3 注册中心注销逻辑

```java
public abstract class AbstractRegistryFactory implements RegistryFactory {
	public static void destroyAll() {
        LOCK.lock();
        try {
            for (Registry registry : getRegistries()) {
                try {
                    registry.destroy();
                } catch (Throwable e) {
                    LOGGER.error(e.getMessage(), e);
                }
            }
            REGISTRIES.clear();
        } finally {
            // Release the lock
            LOCK.unlock();
        }
    }
}
```

这段代码对应了 3.2 小节 ProtocolConfig 源码的第 1 部分，代表了注册中心的注销逻辑，更深一层的源码不需要 debug 进去了，大致的逻辑就是删除掉注册中心中本节点对应的服务提供者地址。

```java
// Wait for registry notification
try {
    Thread.sleep(ConfigUtils.getServerShutdownTimeout());
} catch (InterruptedException e) {
    logger.warn("Interrupted unexpectedly when waiting for registry notification during shutdown process!");
}
```
这段代码对应了 3.2 小节 ProtocolConfig 源码的第 2 部分，`ConfigUtils.getServerShutdownTimeout()` 默认值是 10s，为什么需要在 shutdown hook 中等待 10s 呢？在注释中可以发现这段代码的端倪，原来是为了给服务消费者一点时间，确保等到注册中心的通知。10s 显然是一个经验值，这里也不妨和大家探讨一下，如何稳妥地设置这个值呢？

- 设置的过短。由于注册中心通知消费者取消订阅某个地址是异步通知过去的，可能消费者还没收到通知，提供者这边就停机了，这就违背了我们的诉求 1：**服务消费者不应该请求到已经下线的服务提供者**。
- 设置的过长。这会导致发布时间变长，带来不必要的等待。

两个情况对比下，起码可以得出一个实践经验：如果拿捏不准等待时间，尽量设置一个宽松的一点的等待时间。

这个值主要取决三点因素：

- 集群规模的大小。如果只有几个服务，每个服务只有几个实例，那么再弱鸡的注册中心也能很快的下发通知。
- 注册中心的选型。以 Naocs 和 Zookeeper 为例，同等规模服务实例下 Nacos 在推送地址方面的能力远超 Zookeeper。
- 网络状况。服务提供者和服务消费者与注册中心的交互逻辑走的 TCP 通信，网络状况也会影响到推送时间。

所以需要根据实际部署场景测量出最合适的值。

### 3.4 协议/流程注销逻辑

```java
ExtensionLoader<Protocol> loader = ExtensionLoader.getExtensionLoader(Protocol.class);
for (String protocolName : loader.getLoadedExtensions()) {
    try {
        Protocol protocol = loader.getLoadedExtension(protocolName);
        if (protocol != null) {
            protocol.destroy();
        }
    } catch (Throwable t) {
        logger.warn(t.getMessage(), t);
    }
}
```
这段代码对应了 3.2 小节 ProtocolConfig 源码的第 3 部分，在运行时，`loader.getLoadedExtension(protocolName)`  这段代码会加载到两个协议 ：`DubboProtocol` 和 `Injvm` 。后者 `Injvm` 实在没啥好讲的，主要来分析一下 `DubboProtocol` 的逻辑。

`DubboProtocol` 实现了我们前面提到的 `Protocol` 接口，它的 destory 方法是我们重点要看的。

```java
public class DubboProtocol extends AbstractProtocol {

    public void destroy() {
        for (String key : new ArrayList<String>(serverMap.keySet())) {
            ExchangeServer server = serverMap.remove(key);
            if (server != null) {
            	server.close(ConfigUtils.getServerShutdownTimeout());
            }
        }

        for (String key : new ArrayList<String>(referenceClientMap.keySet())) {
            ExchangeClient client = referenceClientMap.remove(key);
            if (client != null) {
            	client.close(ConfigUtils.getServerShutdownTimeout());
            }
        }

        for (String key : new ArrayList<String>(ghostClientMap.keySet())) {
            ExchangeClient client = ghostClientMap.remove(key);
            if (client != null) {
                client.close(ConfigUtils.getServerShutdownTimeout());
            }
        }
        stubServiceMethodsMap.clear();
        super.destroy();
    }
}
```

主要分成了两部分注销逻辑：server 和 client，注意这里是先注销了服务提供者后，再注销了服务消费者，这样做是有意为之。在 RPC 调用中，经常是一个远程调用触发一个远程调用，所以在关闭一个节点时，应该先切断上游的流量，所以这里是先注销了服务提供者，这样从一定程度上，降低了后面服务消费者被调用到的可能性（当然，服务消费者也有可能被单独调用到）。由于 server 和 client 的流程类似，所以我只选取了 server 部分来分析具体的注销逻辑。

```java
	public void close(final int timeout) {
        startClose();
        if (timeout > 0) {
            final long max = (long) timeout;
            final long start = System.currentTimeMillis();

            if (getUrl().getParameter(Constants.CHANNEL_SEND_READONLYEVENT_KEY, true)) {
                // 如果注册中心有延迟，会立即受到readonly事件，下次不会再调用这台机器，当前已经调用的会处理完
                sendChannelReadOnlyEvent();
            }
            while (HeaderExchangeServer.this.isRunning() // ①
                    && System.currentTimeMillis() - start < max) {
                try {
                    Thread.sleep(10);
                } catch (InterruptedException e) {
                    logger.warn(e.getMessage(), e);
                }
            }
        }
        doClose(); // ②
        server.close(timeout); // ③
    }
    
    private boolean isRunning() {
        Collection<Channel> channels = getChannels();
        for (Channel channel : channels) {
            if (DefaultFuture.hasFuture(channel)) {
                return true;
            }
        }
        return false;
    }

	private void doClose() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        stopHeartbeatTimer();
        try {
            scheduled.shutdown();
        } catch (Throwable t) {
            logger.warn(t.getMessage(), t);
        }
    }
```

化繁为简，这里只挑选上面代码中打标的两个地方进行分析

1. 判断服务端是否还在处理请求，在超时时间内一直等待到所有任务处理完毕
2. 关闭心跳检测
3. 关闭 NettyServer

特别需要关注第一点，正符合我们在一开始提出的优雅停机的诉求 2：**“在途请求需要处理完毕，不能被停机指令中断”**。

### 3.5 优雅停机初始方案总结

上述介绍的几个类构成了 Dubbo 2.5.x 的优雅停机方案，简单做一下总结，Dubbo 的优雅停机逻辑时序如下：

```
Registry 注销
等待 -Ddubbo.service.shutdown.wait 秒，等待消费方收到下线通知
Protocol 注销
    DubboProtocol 注销
		NettyServer 注销
			等待处理中的请求完毕
            停止发送心跳
            关闭 Netty 相关资源
		NettyClient 注销
            停止发送心跳
            等待处理中的请求完毕
            关闭 Netty 相关资源
```

> Dubbo 2.5.3 优雅停机的缺陷
>
> 如果你正在使用的 Dubbo 版本 <= 2.5.3，一些并发问题和代码缺陷会导致你的应用不能很好的实现优雅停机功能，请尽快升级。
>
> 详情可以参考该 pull request 的变更：https://github.com/apache/dubbo/pull/568

## 4 Spring 容器下 Dubbo 的优雅停机

上述的方案在不使用 Spring 时的确是无懈可击的，但由于现在大多数开发者选择使用 Spring 构建 Dubbo 应用，上述的方案会存在一些缺陷。

由于 Spring 框架本身也依赖于 shutdown hook 执行优雅停机，并且与 Dubbo 的优雅停机会并发执行，而 Dubbo 的一些 Bean 受 Spring 托管，当 Spring 容器优先关闭时，会导致 Dubbo 的优雅停机流程无法获取相关的 Bean，从而优雅停机失效。

Dubbo 开发者们迅速意识到了 shutdown hook 并发执行的问题，开始了一系列的补救措施。

### 4.1 增加 ShutdownHookListener

Spring 如此受欢迎的原因之一便是它的扩展点非常丰富，例如它提供了 `ApplicationListener` 接口，开发者可以实现这个接口监听到 Spring 容器的关闭事件，为解决 shutdown hook 并发执行的问题，在 Dubbo 2.6.3 中新增了 `ShutdownHookListener` 类，用作 Spring 容器下的关闭 Dubbo 应用的钩子。

```java
    private static class ShutdownHookListener implements ApplicationListener {
        @Override
        public void onApplicationEvent(ApplicationEvent event) {
            if (event instanceof ContextClosedEvent) {
                // we call it anyway since dubbo shutdown hook make sure its destroyAll() is re-entrant.
                // pls. note we should not remove dubbo shutdown hook when spring framework is present, this is because
                // its shutdown hook may not be installed.
                DubboShutdownHook shutdownHook = DubboShutdownHook.getDubboShutdownHook();
                shutdownHook.destroyAll();
            }
        }
    }
```

当服务提供者 `ServiceBean` 和服务消费者 `ReferenceBean` 被初始化时，会触发该钩子被创建。

再来看看 AbstractConfig 中的代码，依旧保留了 JVM 的 shutdown hook

```java
public abstract class AbstractConfig implements Serializable {
    static {
        Runtime.getRuntime().addShutdownHook(DubboShutdownHook.getDubboShutdownHook());
    }
}
```

也就是说，在 Spring 环境下会注册两个钩子，在 Non-Spring 环境下只会有一个钩子，但看到 2.6.x 的实现大家是否意识到了两个问题呢？

1. 两个钩子并发执行不会报错吗？
2. 为什么在 Spring 下不取消 JVM 的钩子，只保留 Spring 的钩子不就可以工作了吗？

先解释第一个问题，这个按照我的理解，这段代码的 Commiter 可能认为只需要有一个 Spring 的钩子能正常注销就完事了，不需要考虑另外一个报不报错，因为都是独立的线程，不会有很大的影响。

再解释第二个问题，其实这个疑问的答案就藏在上面 `ShutdownHookListener` 代码的注释中，这段注释的意思是说：在 Spring 框架下不能直接移除原先的 JVM 钩子，因为 Spring 框架可能没有注册 ContextClosed 事件。啥意思呢？这里涉及到 Spring 框架生命周期的一个细节，我打算单独介绍一下。

### 4.2 Spring 的容器关闭事件详解

在 Spring 中，我们可以使用至少三种方式来注册容器关闭时一些收尾工作：

1. 使用 DisposableBean 接口

   ```java
   public class TestDisposableBean implements DisposableBean {
   
       @Override
       public void destroy() throws Exception {
           System.out.println("== invoke DisposableBean ==");
       }
   }
   ```

2. 使用 @PreDestroy 注解

   ```java
   public class TestPreDestroy {
   
       @PreDestroy
       public void preDestroy(){
           System.out.println("== invoke preDestroy ==");
       }
   
   }
   ```

3. 使用 ApplicationListener 监听 ContextClosedEvent

   ```java
   applicationContext.addApplicationListener(new ApplicationListener<ApplicationEvent>() {
   	@Override
   	public void onApplicationEvent(ApplicationEvent applicationEvent) {
   		if (applicationEvent instanceof ContextClosedEvent) {
   			System.out.println("== receive context closed event ==");
   		}
   	}
   });
   ```

但需要注意的是，在使用 SpringBoot 内嵌 Tomcat 容器时，容器关闭钩子是自动被注册，但使用纯粹的 Spring 框架或者外部 Tomcat 容器，需要显式的调用 `context.registerShutdownHook();` 接口进行注册

```java
ClassPathXmlApplicationContext context = new ClassPathXmlApplicationContext("spring/beans.xml");
context.start();
context.registerShutdownHook();
context.addApplicationListener(new ApplicationListener<ApplicationEvent>() {
    @Override
    public void onApplicationEvent(ApplicationEvent applicationEvent) {
        if (applicationEvent instanceof ContextClosedEvent) {
            System.out.println("== receive context closed event ==");
        }
    }
});
```

否则，上述三种回收方法都无法工作。我们来看看 `registerShutdownHook()` 都干了啥

```java
public abstract class AbstractApplicationContext extends DefaultResourceLoader
		implements ConfigurableApplicationContext, DisposableBean{
	@Override
	public void registerShutdownHook() {
		if (this.shutdownHook == null) {
			// No shutdown hook registered yet.
			this.shutdownHook = new Thread() {
				@Override
				public void run() {
					synchronized (startupShutdownMonitor) {
						doClose();
					}
				}
			};
			Runtime.getRuntime().addShutdownHook(this.shutdownHook); // 重点！
		}
	}
}
```

其实也就是显式注册了一个属于 Spring 的钩子。这也解释上了 4.1 小节中，为什么有那段注释了，注册了事件不一定管用，还得保证 Spring 容器注册了它自己的钩子。

### 4.3 Dubbo 优雅停机中级方案总结

第 4 节主要介绍了 Dubbo 开发者们在 Spring 环境下解决 Dubbo 优雅停机并发执行 shutdown hook 时的缺陷问题，但其实还不完善，因为在 Spring 环境下，如果没有显式注册 Spring 的 shutdown， 还是会存在缺陷的，准确的说，Dubbo 2.6.x 版本可以很好的在 Non-Spring、Spring Boot、Spring + ContextClosedEvent 环境下很好的工作。

## 5 Dubbo 2.7 最终方案

```java
public class SpringExtensionFactory implements ExtensionFactory {
    public static void addApplicationContext(ApplicationContext context) {
        CONTEXTS.add(context);
        if (context instanceof ConfigurableApplicationContext) {
            ((ConfigurableApplicationContext) context).registerShutdownHook();
            DubboShutdownHook.getDubboShutdownHook().unregister();
        }
        BeanFactoryUtils.addApplicationListener(context, SHUTDOWN_HOOK_LISTENER);
    }
}
```

这段代码寥寥数行，却是经过了深思熟虑之后的产物，期间迭代了 3 个大版本，真是不容易。这段代码很好地解决了第 4 节提出的两个问题

1. 担心两个钩子并发执行有问题？那就在可以注册 Spring 钩子的时候取消掉 JVM 的钩子。
2. 担心当前 Spring 容器没有注册 Spring 钩子？那就显示调用 registerShutdownHook 进行注册。

其他细节方面的优化和 bugfix 我就不进行详细介绍了，可以见得实现一个优雅停机需要考虑的点非常之多。

## 6 总结

优雅停机看似是一个不难的技术点，但在一个通用框架中，使用者的业务场景类型非常多，这会大大加剧整个代码实现的复杂度。

摸清楚整个 Dubbo 优雅停机演化的过程，也着实花费了我一番功夫，有很多实现需要 checkout 到非常古老的分支，同时翻阅了很多 issue、pull request 的讨论，最终才形成了这篇文章，虽然研究的过程是困难的，但获取到真相是让人喜悦的。

在开源产品的研发过程中，服务到每一个类型的用户真的是非常难的一件事，能做的是满足大部分用户。例如 2.6.x 在大多数环境下其实已经没问题了，在 2.7.x 中则是得到了更加的完善，但是我相信，在使用 Dubbo 的部分用户中，可能还是会存在优雅停机的问题，只不过还没有被发现。

商业化的思考：和开源产品一样，商业化产品的研发也同样是一个逐渐迭代的过程，需要数代开发者一起维护一份代码，使用者发现问题，开发者修复问题，这样的正反馈可以形成一个正反馈，促使产品更加优秀。



**相关 pull request:**

修复 2.5.3 bug 的 pr：

https://github.com/apache/dubbo/pull/568 作者：@**qinliujie** 

2.6.x Spring Shutdown Hook Enhancement: 

https://github.com/apache/dubbo/pull/1763 作者：@**ralf0131**

https://github.com/apache/dubbo/pull/1820 作者：@**ralf0131**

2.7.x Spring Shutdown Hook Enhancement: 

https://github.com/apache/dubbo/pull/3008/ 作者：@**beiwei30**

