---
title: 小白也能懂的 Nacos 服务模型介绍
date: 2021-03-14 14:59:28
tags:
- Nacos
categories:
- Nacos
toc: true
---

## 前言

按照目前市场上的主流使用场景，Nacos 被分成了两块功能：服务注册发现（Naming）和配置中心（Config）。在之前的文章中我介绍了 Nacos 配置中心的实现原理，今天这篇文章所介绍的内容则是与 Nacos 服务注册发现功能相关，来聊一聊 Nacos 的服务模型。

说到服务模型，其实需要区分视角，一是用户视角，一个内核视角。即 Nacos 用户视角看到的服务模型和 Nacos 开发者设计的内核模型可能是完全不一样的，而今天的文章，是站在用户视角观察的，旨在探讨 Nacos 服务发现的最佳实践。

<!-- more -->

## 服务模型介绍

一般我在聊注册中心时，都会以 Zookeeper 为引子，这也是很多人最熟悉的注册中心。但如果你真的写过或看过使用 Zookeeper 作为注册中心的适配代码，会发现并不是那么容易，再加上注册中心涉及到的一致性原理，这就导致很多人对注册中心的第一印象是：这个东西好难！ 但归根到底是因为 Zookeeper 根本不是专门为注册中心而设计的，其提供的 API 以及内核设计，并没有预留出「服务模型」的概念，这就使得开发者需要自行设计一个模型，去填补 Zookeeper 和服务发现之间的鸿沟。

微服务架构逐渐深入人心后，Nacos、Consul、Eureka 等注册中心组件进入大众的视线。可以发现，这些”真正“的注册中心都有各自的「服务模型」，在使用上也更加的方便。

为什么要有「服务模型」？理论上，一个基础组件可以被塑造成任意的模样，如果你愿意，一个数据库也可以被设计成注册中心，这并不是”夸张“的修辞手法，在阿里还真有人这么干过。那么代价是什么呢？一定会在业务发展到一定体量后遇到瓶颈，一定会遇到某些极端 case 导致其无法正常工作，一定会导致其扩展性低下。正如刚学习数据结构时，同学们常见的一个疑问一样：为什么栈只能先进后出。不是所有开发都是中间件专家，所以 Nacos 设计了自己的「服务模型」，这虽然限制了使用者的”想象力“，但保障了使用者在正确地使用 Nacos。

花了一定的篇幅介绍 Nacos 为什么需要设计「服务模型」，再来看看实际的 Nacos 模型是个啥，其实没那么玄乎，一张图就能表达清楚：

![服务模型](https://kirito.iocoder.cn/image-20210314161429839.png)

与 Consul、Eureka 设计有别，Nacos 服务发现使用的领域模型是命名空间-分组-服务-集群-实例这样的多层结构。服务 Service 和实例 Instance 是核心模型，命名空间 Namespace 、分组 Group、集群 Cluster 则是在不同粒度实现了服务的隔离。

为了更好的理解两个核心模型：Service 和 Instance，我们以 Dubbo 和 SpringCloud 这两个已经适配了 Nacos 注册中心的微服务框架为例，介绍下二者是如何映射对应模型的。

- Dubbo。将接口三元组（接口名+分组名+版本号）映射为 Service，将实例 IP 和端口号定义为 Instance。一个典型的注册在 Nacos 中的 Dubbo 服务：`providers:com.alibaba.mse.EchoService:1.0.0:DUBBO`
- Spring Cloud。将应用名映射为 Service，将实例 IP 和端口号定义为 Instance。一个典型的注册在 Nacos 中的 Spring Cloud 服务：`helloApp`

下面我们将会更加详细地阐释 Nacos 提供的 API 和服务模型之间的关系。

<!-- more -->

## 环境准备

需要部署一个 Nacos Server 用于测试，我这里选择直接在 https://mse.console.aliyun.com/ 购买一个 MSE 托管的 Nacos，读者们可以选择购买 MSE Nacos 或者自行搭建一个 Nacos Server。

![MSE](https://kirito.iocoder.cn/image-20210314163510445.png)

MSE Nacos 提供的可视化控制台，也可以帮助我们更好的理解 Nacos 的服务模型。下文的一些截图，均来自 MSE Nacos 的商业化控制台。

## 快速开始

先来实现一个最简单的服务注册与发现 demo。Nacos 支持从客户端注册服务实例和订阅服务，具体代码如下：

```java
Properties properties = new Properties();
properties.setProperty(PropertyKeyConst.SERVER_ADDR, "mse-xxxx-p.nacos-ans.mse.aliyuncs.com:8848");

String serviceName = "nacos.test.service.1";
String instanceIp = InetAddress.getLocalHost().getHostAddress();
int instancePort = 8080;

namingService.registerInstance(serviceName, instanceIp, instancePort);

System.out.println(namingService.getAllInstances(serviceName));
```

上述代码定义了一个 service：`nacos.test.service.1`；定义了一个 instance，以本机 host 为 IP 和 8080 为端口号，观察实际的注册情况：

![服务信息](https://kirito.iocoder.cn/image-20210314165514015.png)

![实例信息](https://kirito.iocoder.cn/image-20210314173532176.png)

并且控制台也打印出了服务的详情。至此一个最简单的 Nacos 服务发现 demo 就已经完成了。对一些细节稍作解释：

- 属性 `PropertyKeyConst.SERVER_ADDR` 表示的是 Nacos 服务端的地址。
- 创建一个 NamingService 实例，客户端将为该实例创建单独的资源空间，包括缓存、线程池以及配置等。Nacos 客户端没有对该实例做单例的限制，请小心维护这个实例，以防新建多于预期的实例。
- 注册服务 `registerInstance` 使用了最简单的重载方法，只需要传入服务名、IP、端口就可以。

上述的例子中，并没有出现 Namespace、Group、Cluster 等前文提及的服务模型，我会在下面一节详细介绍，这个例子主要是为了演示 Nacos 支持的一些缺省配置，其中 Service 和 Instance 是必不可少的，这也验证了前文提到的服务和实例是 Nacos 的一等公民。

通过截图我们可以发现缺省配置的默认值：

- Namespace：默认值是 public 或者空字符串，都可以代表默认命名空间。
- Group：默认值是 DEFAULT_GROUP。
- Cluster：默认值是 DEFAULT。

## 构建自定义实例

为了展现出 Nacos 服务模型的全貌，还需要介绍下实例相关的 API。例如我们希望注册的实例中，有一些能够被分配更多的流量；或者能够传入一些实例的元信息存储到 Nacos 服务端，例如 IP 所属的应用或者所在的机房，这样在客户端可以根据服务下挂载的实例元信息，来自定义负载均衡模式。Nacos 也提供了另外的注册实例接口，使得用户在注册实例时可以指定实例的属性：

```java
/**
 * register a instance to service with specified instance properties.
 *
 * @param serviceName name of service
 * @param groupName   group of service
 * @param instance    instance to register
 * @throws NacosException nacos exception
 */
void registerInstance(String serviceName, String groupName, Instance instance) throws NacosException;
```

这个方法在注册实例时，可以传入一个 Instance 实例，它的属性如下：

```java
public class Instance {
    
    /**
     * unique id of this instance.
     */
    private String instanceId;
    
    /**
     * instance ip.
     */
    private String ip;
    
    /**
     * instance port.
     */
    private int port;
    
    /**
     * instance weight.
     */
    private double weight = 1.0D;
    
    /**
     * instance health status.
     */
    private boolean healthy = true;
    
    /**
     * If instance is enabled to accept request.
     */
    private boolean enabled = true;
    
    /**
     * If instance is ephemeral.
     *
     * @since 1.0.0
     */
    private boolean ephemeral = true;
    
    /**
     * cluster information of instance.
     */
    private String clusterName;
    
    /**
     * Service information of instance.
     */
    private String serviceName;
    
    /**
     * user extended attributes.
     */
    private Map<String, String> metadata = new HashMap<String, String>();
}
```

有一些字段可以望文生义，有一些则需要花些功夫专门去了解 Nacos 的设计，我这里挑选几个我认为重要的属性重点介绍下：

- healthy 实例健康状态。标识该实例是否健康，一般心跳健康检查会自动更新该字段。
- enable 是否启用。它跟 healthy 区别在于，healthy 一般是由内核健康检查更新，而 enable 更多是业务语义偏多，可以完全根据业务场景操控。例如在 Dubbo 中，一般使用该字段标识某个实例 IP 的上下线状态。
- ephemeral 临时实例还是持久化实例。非常关键的一个字段，需要对 Nacos 有较为深入的了解才能够理解该字段的含义。区别在于，心跳检测失败一定时间之后，实例是自动下线还是标记为不健康。一般在注册中心场景下，会使用临时实例。这样心跳检测失败之后，可以让消费者及时收到下线通知；而在 DNS 模式下，使用持久化实例较多。在《一文详解 Nacos 高可用特性》中我也介绍过，该字段还会影响到 Nacos 的一致性协议。
- metadata 元数据。一个 map 结构，可以存储实例的自定义扩展信息，例如机房信息，路由标签，应用信息，权重信息等。

这些信息在由服务提供者上报之后，由服务消费者获取，从而完成信息的传递。以下是一个完整的实例注册演示代码：

```java
Properties properties = new Properties();
// 指定 Nacos Server 地址
properties.setProperty(PropertyKeyConst.SERVER_ADDR, "mse-xxxx-p.nacos-ans.mse.aliyuncs.com:8848");
// 指定命名空间
properties.setProperty(PropertyKeyConst.NAMESPACE, "9125571e-bf50-4260-9be5-18a3b2e3605b");

NamingService namingService = NacosFactory.createNamingService(properties);
String serviceName = "nacos.test.service.1";
String group = "DEFAULT_GROUP";
String clusterName = "cn-hangzhou";
String instanceIp = InetAddress.getLocalHost().getHostAddress();
int instancePort = 8080;
Instance instance = new Instance();
// 指定集群名
instance.setClusterName(clusterName);
instance.setIp(instanceIp);
instance.setPort(instancePort);
// 指定实例的元数据
Map<String, String> metadata = new HashMap<>();
metadata.put("app", "nacos-demo");
metadata.put("site", "cn-hangzhou");
metadata.put("protocol", "1.3.3");
instance.setMetadata(metadata);
// 指定服务名、分组和实例
namingService.registerInstance(serviceName, group, instance);

System.out.println(namingService.getAllInstances(serviceName));
```

![服务信息](https://kirito.iocoder.cn/image-20210314173008765.png)

![实例信息](https://kirito.iocoder.cn/image-20210314173750457.png)

## 构建自定义服务

除了实例之外，服务也可以自定义配置，Nacos 的服务随着实例的注册而存在，并随着所有实例的注销而消亡。不过目前 Nacos 对于自定义服务的支持不是很友好，除使用 OpenApi 可以修改服务的属性外，就只能使用注册实例时传入的服务属性来进行自定义配置。所以在实际的 Dubbo 和 SpringCloud 中，自定义服务一般较少使用，而自定义实例信息则相对常用。

Nacos 的服务与 Consul、Eureka 的模型都不同，Consul 与 Eureka的服务等同于 Nacos 的实例，每个实例有一个服务名属性，服务本身并不是一个单独的模型。Nacos 的设计在我看来更为合理，其认为服务本身也是具有数据存储需求的，例如作用于服务下所有实例的配置、权限控制等。实例的属性应当继承自服务的属性，实例级别可以覆盖服务级别。以下是服务的数据结构：

```java
/**
     * Service name
     */
    private String name;

    /**
     * Protect threshold
     */
    private float protectThreshold = 0.0F;

    /**
     * Application name of this service
     */
    private String app;

    /**
     * Service group which is meant to classify services into different sets.
     */
    private String group;

    /**
     * Health check mode.
     */
    private String healthCheckMode;

    private Map<String, String> metadata = new HashMap<String, String>();
```

在实际使用过程中，可以像快速开始章节中介绍的那样，仅仅使用 ServiceName 标记一个服务。

## 服务隔离：Namespace&Group&Cluster

出于篇幅考虑，这三个概念放到一起介绍。

襄王有意，神女无心。Nacos 提出了这几种隔离策略，目前看来只有 Namespace 在实际应用中使用较多，而 Group 和 Cluster 并没有被当回事。

Cluster 集群隔离在阿里巴巴内部使用的非常普遍。一个典型的场景是这个服务下的实例，需要配置多种健康检查方式，有一些实例使用 TCP 的健康检查方式，另外一些使用 HTTP 的健康检查方式。另一个场景是，服务下挂载的机器分属不同的环境，希望能够在某些情况下将某个环境的流量全部切走，这样可以通过集群隔离，来做到一次性切流。在 Nacos 2.0 中，也在有意的弱化集群的概念，毕竟开源还是要面向用户的，有些东西适合阿里，但不一定适合开源，等再往后演进，集群这个概念又有可能重新回到大家的视线中了，history will repeat itself。

Group 分组隔离的概念可以参考 Dubbo 的服务隔离策略，其也有一个分组。支持分组的扩展，用意当然是好的，实际使用上，也的确有一些公司会习惯使用分组来进行隔离。需要注意的一点是：Dubbo 注册三元组（接口名+分组+版本）时，其中 Dubbo 的分组是包含在 Nacos 的服务名中的，并不是映射成了 Nacos 的分组，一般 Nacos 注册的服务是默认注册到 DEFAULT_GROUP 分组的。

Namespace 命名空间隔离，我认为是 Nacos 一个比较好的设计。在实际场景中使用也比较普遍，一般用于多个环境的隔离，例如 daily，dev，test，uat，prod 等环境的隔离。特别是当环境非常多时，使用命名空间做逻辑隔离是一个比较节约成本的策略。但强烈建议大家仅仅在非线上环境使用 Namespace 进行隔离，例如多套测试环境可以共享一套 Nacos，而线上环境单独搭建另一套 Nacos 集群，以免线下测试流量干扰到线上环境。

## 服务发现：推拉模型

上面介绍完了 Nacos 服务发现的 5 大领域模型，最后一节，介绍下如何获取服务模型。

Nacos 的服务发现，有主动拉取和推送两种模式，这与一般的服务发现架构相同。以下是拉模型的相关接口：

```java
/**
 * Get all instances of a service
 *
 * @param serviceName name of service
 * @return A list of instance
 * @throws NacosException
 */
List<Instance> getAllInstances(String serviceName) throws NacosException;

/**
 * Get qualified instances of service
 *
 * @param serviceName name of service
 * @param healthy     a flag to indicate returning healthy or unhealthy instances
 * @return A qualified list of instance
 * @throws NacosException
 */
List<Instance> selectInstances(String serviceName, boolean healthy) throws NacosException;

/**
 * Select one healthy instance of service using predefined load balance strategy
 *
 * @param serviceName name of service
 * @return qualified instance
 * @throws NacosException
 */
Instance selectOneHealthyInstance(String serviceName) throws NacosException;
```

Nacos 提供了三个同步拉取服务的方法，一个是查询所有注册的实例，一个是只查询健康且上线的实例，还有一个是获取一个健康且上线的实例。一般情况下，订阅端并不关心不健康的实例或者权重设为 0 的实例，但是也不排除一些场景下，有一些运维或者管理的场景需要拿到所有的实例。细心的读者会注意到上述 Nacos 实例中有一个 weight 字段，便是作用在此处的`selectOneHealthyInstance`接口上，按照权重返回一个健康的实例。个人认为这个功能相对鸡肋，一般的 RPC 框架都有自身配套的负载均衡策略，很少会由注册中心 cover，事实上 Dubbo 和 Spring Cloud 都没有用到 Nacos 的这个接口。

除了主动查询实例列表，Nacos还提供订阅模式来感知服务下实例列表的变化，包括服务配置或者实例配置的变化。可以使用下面的接口来进行订阅或者取消订阅：

```java
/**
 * Subscribe service to receive events of instances alteration
 *
 * @param serviceName name of service
 * @param listener    event listener
 * @throws NacosException
 */
void subscribe(String serviceName, EventListener listener) throws NacosException;
/**
 * Unsubscribe event listener of service
 *
 * @param serviceName name of service
 * @param listener    event listener
 * @throws NacosException
 */
void unsubscribe(String serviceName, EventListener listener) throws NacosException;
```

在实际的服务发现中，订阅接口尤为重要。消费者启动时，一般会同步获取一次服务信息用于初始化，紧接着订阅服务，这样当服务发生上下线时，就可以感知变化了，从而实现服务发现。

## 总结

Nacos 为了更好的实现服务发现，提供一套成熟的服务模型，其中重点需要关注的是 Namespace、Service 和 Instance，得益于这一套服务模型的抽象，以及对推拉模型的支持，Nacos 可以快速被微服务框架集成。

理解了 Nacos 的服务模型，也有利于我们了解 Nacos 背后的工作原理，从而确保我们正确地使用 Nacos。但 Nacos 提供的这些模型也不一定所有都需要用上，例如集群、分组、权重等概念，被实践证明是相对鸡肋的设计，在使用时，也需要根据自身业务特点去评估特性用量，不要盲目地为了使用技术而去用。
