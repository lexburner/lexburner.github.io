---
title: Dubbo 迈向云原生的里程碑 | 应用级服务发现
date: 2020-06-16 00:33:50
tags:
- DUBBO
categories:
- RPC
type: 2
toc: true
---

## 1 概述

社区版本 Dubbo 从 2.7.5 版本开始，新引入了一种基于应用粒度的服务发现机制，这是 Dubbo 为适配云原生基础设施的一步重要探索。版本发布到现在已有近半年时间，经过这段时间的探索与总结，我们对这套机制的可行性与稳定性有了更全面、深入的认识；同时在 Dubbo 3.0 的规划也在全面进行中，如何让应用级服务发现成为未来下一代服务框架 Dubbo 3.0 的基础服务模型，解决云原生、规模化微服务集群扩容与可伸缩性问题，也已经成为我们当前工作的重点。

既然这套新机制如此重要，那它到底是怎么工作的，今天我们就来详细解读一下。在最开始的社区版本，我们给这个机制取了一个神秘的名字 - 服务自省，下文将进一步解释这个名字的由来，并引用服务自省代指这套应用级服务发现机制。

熟悉 Dubbo 开发者应该都知道，一直以来都是面向 RPC 方法去定义服务的，并且这也是 Dubbo 开发友好性、治理功能强的基础。既然如此，那我们为什么还要定义个应用粒度的服务发现机制那？这个机制到底是怎么工作的？它与当前机制的区别是什么？它能给我们带来哪些好处那？对适配云原生、性能提升又有哪些帮助？

带着所有的这些问题，我们开始本文的讲解。

<!-- more -->

## 2 服务自省是什么？

首先，我们先来解释文章开篇提到的问题：

- 应用粒度服务发现是到底是一种怎样的模型，它与当前的 Dubbo 服务发现模型的区别是什么？
- 我们为什么叫它服务自省？

所谓“应用/实例粒度” 或者“RPC 服务粒度”强调的是一种地址发现的数据组织格式。

![1](https://image.cnkirito.cn/46ddc6ead81d44fe1c68fb189a687f3e3fa60101.png)

以 Dubbo 当前的地址发现数据格式为例，它是“RPC 服务粒度”的，它是以 RPC 服务作为 key，以实例列表作为 value 来组织数据的：

```
"RPC Service1": [
  {"name":"instance1", "ip":"127.0.0.1", "metadata":{"timeout":1000}},
  {"name":"instance2", "ip":"127.0.0.1", "metadata":{"timeout":2000}},
  {"name":"instance3", "ip":"127.0.0.1", "metadata":{"timeout":3000}},
]
"RPC Service2": [Instance list of RPC Service2],
"RPC ServiceN": [Instance list of RPC ServiceN]
```

而我们新引入的“应用粒度的服务发现”，它以应用名（Application）作为 key，以这个应用部署的一组实例（Instance）列表作为 value。这带来两点不同：

1. 数据映射关系变了，从 RPC Service -> Instance 变为 Application -> Instance
2. 数据变少了，注册中心没有了 RPC Service 及其相关配置信息

```
"application1": [
  {"name":"instance1", "ip":"127.0.0.1", "metadata":{}},
  {"name":"instance2", "ip":"127.0.0.1", "metadata":{}},
  {"name":"instanceN", "ip":"127.0.0.1", "metadata":{}}
]
```

要进一步理解新模型带来的变化，我们看一下应用与 RPC 服务间的关系，显而易见的，1 个应用内可能会定义 n 个 RPC Service。因此 Dubbo 之前的服务发现粒度更细，在注册中心产生的数据条目也会更多（与 RPC 服务成正比），同时也存在一定的数据冗余。

简单理解了应用级服务发现的基本机制，接着解释它为什么会被叫做“服务自省”？其实这还是得从它的工作原理说起，上面我们提到，应用粒度服务发现的数据模型有几个以下明显变化：数据中心的数据量少了，RPC 服务相关的数据在注册中心没有了，现在只有 application - instance 这两个层级的数据。为了保证这部分缺少的 RPC 服务数据仍然能被 Consumer 端正确的感知，我们在 Consumer 和 Provider 间建立了一条单独的通信通道：**Consumer 和 Provider 两两之间通过特定端口交换信息**，我们把这种 Provider 自己主动暴露自身信息的行为认为是一种内省机制，因此从这个角度出发，我们把整个机制命名为：服务自省。

## 3 为什么需要服务自省？

上面讲服务自省的大概原理的时候也提到了它给注册中心带来的几点不同，这几点不同体现在 Dubbo 框架侧（甚至整个微服务体系中），有以下优势：

1. 与业界主流微服务模型对齐，比如 SpringCloud、Kubernetes Native Service等。
2. 提升性能与可伸缩性。注册中心数据的重新组织（减少），能最大幅度的减轻注册中心的存储、推送压力，进而减少 Dubbo Consumer 侧的地址计算压力；集群规模也开始变得可预测、可评估（与 RPC 接口数量无关，只与实例部署规模相关）。

### 3.1 对齐主流微服务模型

自动、透明的实例地址发现（负载均衡）是所有微服务框架需要解决的事情，这能让后端的部署结构对上游微服务透明，上游服务只需要从收到的地址列表中选取一个，发起调用就可以了。要实现以上目标，涉及两个关键点的自动同步：

- 实例地址，服务消费方需要知道地址以建立链接
- RPC 方法定义，服务消费方需要知道 RPC 服务的具体定义，不论服务类型是 rest 或 rmi 等。

![2](https://image.cnkirito.cn/de21f1ab3366f3c1ecaa648f0ad6e0d84aac7440.png)

对于 RPC 实例间借助注册中心的数据同步，REST 定义了一套非常有意思的成熟度模型，感兴趣的朋友可以参考这里的链接 [https://www.martinfowler.com/articles/richardsonMaturityModel.html](https://yq.aliyun.com/go/articleRenderRedirect?url=https%3A%2F%2Fwww.martinfowler.com%2Farticles%2FrichardsonMaturityModel.html)， 按照文章中的 4 级成熟度定义，Dubbo 当前基于接口粒度的模型可以对应到 L4 级别。

接下来，我们看看 Dubbo、SpringCloud 以及 Kubernetes 分别是怎么围绕自动化的实例地址发现这个目标设计的。

**1. Spring Cloud**

Spring Cloud 通过注册中心只同步了应用与实例地址，消费方可以基于实例地址与服务提供方建立链接，但是消费方对于如何发起 http 调用（SpringCloud 基于 rest 通信）一无所知，比如对方有哪些 http endpoint，需要传入哪些参数等。

RPC 服务这部分信息目前都是通过线下约定或离线的管理系统来协商的。这种架构的优缺点总结如下。
优势：部署结构清晰、地址推送量小；
缺点：地址订阅需要指定应用名， provider 应用变更（拆分）需消费端感知；RPC 调用无法全自动同步。

![3](https://image.cnkirito.cn/51d71432a1411e85c0f4ed483c5a6739bcd7909c.png)

**2. Dubbo**

Dubbo 通过注册中心同时同步了实例地址和 RPC 方法，因此其能实现 RPC 过程的自动同步，面向 RPC 编程、面向 RPC 治理，对后端应用的拆分消费端无感知，其缺点则是地址推送数量变大，和 RPC 方法成正比。

![4](https://image.cnkirito.cn/470ae02261cec1b1884737bd703222507027d184.png)

**3. Dubbo + Kubernetes**

Dubbo 要支持 Kubernetes native service，相比之前自建注册中心的服务发现体系来说，在工作机制上主要有两点变化：

- 服务注册由平台接管，provider 不再需要关心服务注册
- consumer 端服务发现将是 Dubbo 关注的重点，通过对接平台层的 API-Server、DNS 等，Dubbo client 可以通过一个 [Service Name](https://yq.aliyun.com/go/articleRenderRedirect?url=https%3A%2F%2Fkubernetes.io%2Fdocs%2Fconcepts%2Fservices-networking%2Fservice%2F)（通常对应到 Application Name）查询到一组 [Endpoints]()（一组运行 provider 的 pod），通过将 Endpoints 映射到 Dubbo 内部地址列表，以驱动 Dubbo 内置的负载均衡机制工作。

> Kubernetes Service 作为一个抽象概念，怎么映射到 Dubbo 是一个值得讨论的点
>
> - Service Name - > Application Name，Dubbo 应用和 Kubernetes 服务一一对应，对于微服务运维和建设环节透明，与开发阶段解耦。
>
>   ```
>   apiVersion: v1
>   kind: Service
>   metadata:
>     name: provider-app-name
>   spec:
>     selector:
>   app: provider-app-name
>     ports:
>   - protocol: TCP
>   port: 
>   targetPort: 9376
>   ```
>
> - Service Name - > Dubbo RPC Service，Kubernetes 要维护调度的服务与应用内建 RPC 服务绑定，维护的服务数量变多。
>
>   ```
>   ---
>   apiVersion: v1
>   kind: Service
>   metadata:
>     name: rpc-service-1
>   spec:
>     selector:
>       app: provider-app-name
>     ports: ##
>   ...
>   ---
>   apiVersion: v1
>   kind: Service
>   metadata:
>     name: rpc-service-2
>   spec:
>     selector:
>       app: provider-app-name
>     ports: ##
>   ...
>   ---
>   apiVersion: v1
>   kind: Service
>   metadata:
>     name: rpc-service-N
>   spec:
>     selector:
>       app: provider-app-name
>     ports: ##
>   ...
>   ```

![5](https://image.cnkirito.cn/b986d8df9f93eeb6d985e37604225dd68984f4db.png)

结合以上几种不同微服务框架模型的分析，我们可以发现，Dubbo 与 SpringCloud、Kubernetes 等不同产品在微服务的抽象定义上还是存在很大不同的。SpringCloud 和 Kubernetes 在微服务的模型抽象上还是比较接近的，两者基本都只关心实例地址的同步，如果我们去关心其他的一些服务框架产品，会发现它们绝大多数也是这么设计的；

> 即 REST 成熟度模型中的 L3 级别。

对比起来 Dubbo 则相对是比较特殊的存在，更多的是从 RPC 服务的粒度去设计的。

> 对应 REST 成熟度模型中的 L4 级别。

如我们上面针对每种模型做了详细的分析，每种模型都有其优势和不足。而我们最初决定 Dubbo 要做出改变，往其他的微服务发现模型上的对齐，是我们最早在确定 Dubbo 的云原生方案时，我们发现要让 Dubbo 去支持 Kubernetes Native Service，模型对齐是一个基础条件；另一点是来自用户侧对 Dubbo 场景化的一些工程实践的需求，得益于 Dubbo 对多注册、多协议能力的支持，使得 Dubbo 联通不同的微服务体系成为可能，而服务发现模型的不一致成为其中的一个障碍，这部分的场景描述请参见以下文章：[https://www.atatech.org/articles/157719](https://yq.aliyun.com/go/articleRenderRedirect?url=https%3A%2F%2Fwww.atatech.org%2Farticles%2F157719)

### 3.2 更大规模的微服务集群 - 解决性能瓶颈

这部分涉及到和注册中心、配置中心的交互，关于不同模型下注册中心数据的变化，之前原理部分我们简单分析过。为更直观的对比服务模型变更带来的推送效率提升，我们来通过一个示例看一下不同模型注册中心的对比：

![6](https://image.cnkirito.cn/c275bcf54f023eeac0e63d90e5068a6ec2686893.png)

图中左边是微服务框架的一个典型工作流程，Provider 和 Consumer 通过注册中心实现自动化的地址通知。其中，Provider 实例的信息如图中表格所示：

```
应用 DEMO 包含三个接口 DemoService 1 2 3，当前实例的 ip 地址为 10.210.134.30。
```

- 对于 Spring Cloud 和 Kubernetes 模型，注册中心只会存储一条 `DEMO - 10.210.134.30+metadata` 的数据；
- 对于老的 Dubbo 模型，注册中心存储了三条接口粒度的数据，分别对应三个接口 DemoService 1 2 3，并且很多的址数据都是重复的；

可以总结出，基于应用粒度的模型所存储和推送的数据量是和应用、实例数成正比的，只有当我们的应用数增多或应用的实例数增长时，地址推送压力才会上涨。
而对于基于接口粒度的模型，数据量是和接口数量正相关的，鉴于一个应用通常发布多个接口的现状，这个数量级本身比应用粒度是要乘以倍数的；另外一个关键点在于，接口粒度导致的集群规模评估的不透明，相对于实i例、应用增长都通常是在运维侧的规划之中，接口的定义更多的是业务侧的内部行为，往往可以绕过评估给集群带来压力。

以 Consumer 端服务订阅举例，根据我对社区部分 Dubbo 中大规模头部用户的粗略统计，根据受统计公司的实际场景，一个 Consumer 应用要消费（订阅）的 Provier 应用数量往往要超过 10 个，而具体到其要消费（订阅）的的接口数量则通常要达到 30 个，平均情况下 Consumer 订阅的 3 个接口来自同一个 Provider 应用，如此计算下来，如果以应用粒度为地址通知和选址基本单位，则平均地址推送和计算量将下降 60% 还要多，
而在极端情况下，也就是当 Consumer 端消费的接口更多的来自同一个应用时，这个地址推送与内存消耗的占用将会进一步得到降低，甚至可以超过 80% 以上。

一个典型的几段场景即是 Dubbo 体系中的网关型应用，有些网关应用消费（订阅）达 100+ 应用，而消费（订阅）的服务有 1000+ ，平均有 10 个接口来自同一个应用，如果我们把地址推送和计算的粒度改为应用，则地址推送量从原来的 n *1000 变为 n* 100，地址数量降低可达近 90%。

## 工作原理

### 设计原则

上面一节我们从**服务模型**及**支撑大规模集群**的角度分别给出了 Dubbo 往应用级服务发现靠拢的好处或原因，但这么做的同时接口粒度的服务治理能力还是要继续保留，这是 Dubbo 框架编程模型易用性、服务治理能力优势的基础。
以下是我认为我们做服务模型迁移仍要坚持的设计原则

- 新的服务发现模型要实现对原有 Dubbo 消费端开发者的无感知迁移，即 Dubbo 继续面向 RPC 服务编程、面向 RPC 服务治理，做到对用户侧完全无感知。
- 建立 Consumer 与 Provider 间的自动化 RPC 服务元数据协调机制，解决传统微服务模型无法同步 RPC 级接口配置的缺点。

### 基本原理详解

应用级服务发现作为一种新的服务发现机制，和以前 Dubbo 基于 RPC 服务粒度的服务发现在核心流程上基本上是一致的：即服务提供者往注册中心注册地址信息，服务消费者从注册中心拉取&订阅地址信息。

这里主要的不同有以下两点：

#### 注册中心数据以“应用 - 实例列表”格式组织，不再包含 RPC 服务信息

![7](https://image.cnkirito.cn/82c0d6c6222e4f582a275a70ff52332dcb5dba20.png)

以下是每个 Instance metadata 的示例数据，总的原则是 metadata 只包含当前 instance 节点相关的信息，不涉及 RPC 服务粒度的信息。

总体信息概括如下：实例地址、实例各种环境标、metadata service 元数据、其他少量必要属性。

```json
{
    "name": "provider-app-name",
    "id": "192.168.0.102:20880",
    "address": "192.168.0.102",
    "port": 20880,
    "sslPort": null,
    "payload": {
        "id": null,
        "name": "provider-app-name",
        "metadata": {
            "metadataService": "{\"dubbo\":{\"version\":\"1.0.0\",\"dubbo\":\"2.0.2\",\"release\":\"2.7.5\",\"port\":\"20881\"}}",
            "endpoints": "[{\"port\":20880,\"protocol\":\"dubbo\"}]",
            "storage-type": "local",
            "revision": "6785535733750099598",
        }
    },
    "registrationTimeUTC": 1583461240877,
    "serviceType": "DYNAMIC",
    "uriSpec": null
}
```

#### Client – Server 自行协商 RPC 方法信息

在注册中心不再同步 RPC 服务信息后，服务自省在服务消费端和提供端之间建立了一条内置的 RPC 服务信息协商机制，这也是“服务自省”这个名字的由来。服务端实例会暴露一个预定义的 MetadataService RPC 服务，消费端通过调用 MetadataService 获取每个实例 RPC 方法相关的配置信息。

![8](https://image.cnkirito.cn/89e96f895f76912a7c2d1a6e8b44643176f3c431.png)

当前 MetadataService 返回的数据格式如下，

```json
[
  "dubbo://192.168.0.102:20880/org.apache.dubbo.demo.DemoService?anyhost=true&application=demo-provider&deprecated=false&dubbo=2.0.2&dynamic=true&generic=false&interface=org.apache.dubbo.demo.DemoService&methods=sayHello&pid=9585&release=2.7.5&side=provider&timestamp=1583469714314", 
 "dubbo://192.168.0.102:20880/org.apache.dubbo.demo.HelloService?anyhost=true&application=demo-provider&deprecated=false&dubbo=2.0.2&dynamic=true&generic=false&interface=org.apache.dubbo.demo.DemoService&methods=sayHello&pid=9585&release=2.7.5&side=provider&timestamp=1583469714314",
  "dubbo://192.168.0.102:20880/org.apache.dubbo.demo.WorldService?anyhost=true&application=demo-provider&deprecated=false&dubbo=2.0.2&dynamic=true&generic=false&interface=org.apache.dubbo.demo.DemoService&methods=sayHello&pid=9585&release=2.7.5&side=provider&timestamp=1583469714314"
]
```

> 熟悉 Dubbo 基于 RPC 服务粒度的服务发现模型的开发者应该能看出来，服务自省机制机制将以前注册中心传递的 URL 一拆为二：
>
> - 一部分和实例相关的数据继续保留在注册中心，如 ip、port、机器标识等。
> - 另一部分和 RPC 方法相关的数据从注册中心移除，转而通过 MetadataService 暴露给消费端。
>
> **理想情况下是能达到数据按照实例、RPC 服务严格区分开来，但明显可以看到以上实现版本还存在一些数据冗余，有些也数据还未合理划分。尤其是 MetadataService 部分，其返回的数据还只是简单的 URL 列表组装，这些 URL其实是包含了全量的数据。**

以下是服务自省的一个完整工作流程图，详细描述了服务注册、服务发现、MetadataService、RPC 调用间的协作流程。

![9](https://image.cnkirito.cn/e8c286b5e79d9c085431840d3ee57537ece95d2e.png)

- 服务提供者启动，首先解析应用定义的“普通服务”并依次注册为 RPC 服务，紧接着注册内建的 MetadataService 服务，最后打开 TCP 监听端口。
- 启动完成后，将实例信息注册到注册中心（仅限 ip、port 等实例相关数据），提供者启动完成。
- 服务消费者启动，首先依据其要“消费的 provider 应用名”到注册中心查询地址列表，并完成订阅（以实现后续地址变更自动通知）。
- 消费端拿到地址列表后，紧接着对 MetadataService 发起调用，返回结果中包含了所有应用定义的“普通服务”及其相关配置信息。
- 至此，消费者可以接收外部流量，并对提供者发起 Dubbo RPC 调用

> 在以上流程中，我们只考虑了一切顺利的情况，但在更详细的设计或编码实现中，我们还需要严格约定一些异常场景下的框架行为。比如，如果消费者 MetadataService 调用失败，则在重试知道成功之前，消费者将不可以接收外部流量。

### 服务自省中的关键机制

#### 元数据同步机制

Client 与 Server 间在收到地址推送后的配置同步是服务自省的关键环节，目前针对元数据同步有两种具体的可选方案，分别是：

- 内建 MetadataService。
- 独立的元数据中心，通过中细化的元数据集群协调数据。

**1. 内建 MetadataService**
MetadataService 通过标准的 Dubbo 协议暴露，根据查询条件，会将内存中符合条件的“普通服务”配置返回给消费者。这一步发生在消费端选址和调用前。

**元数据中心**
复用 2.7 版本中引入的元数据中心，provider 实例启动后，会尝试将内部的 RPC 服务组织成元数据的格式到元数据中心，而 consumer 则在每次收到注册中心推送更新后，主动查询元数据中心。

> 注意 consumer 端查询元数据中心的时机，是等到注册中心的地址更新通知之后。也就是通过注册中心下发的数据，我们能明确的知道何时某个实例的元数据被更新了，此时才需要去查元数据中心。

![10](https://image.cnkirito.cn/7a2c72bc9f5e541e8a155a01b303d4c77590a65a.png)

#### RPC 服务 < - > 应用映射关系

回顾上文讲到的注册中心关于“应用 - 实例列表”结构的数据组织形式，这个变动目前对开发者并不是完全透明的，业务开发侧会感知到查询/订阅地址列表的机制的变化。具体来说，相比以往我们基于 RPC 服务来检索地址，现在 consumer 需要通过指定 provider 应用名才能实现地址查询或订阅。

老的 Consumer 开发与配置示例：

```
<!-- 框架直接通过 RPC Service 1/2/N 去注册中心查询或订阅地址列表 -->
<dubbo:registry address="zookeeper://127.0.0.1:2181"/>
<dubbo:reference interface="RPC Service 1" />
<dubbo:reference interface="RPC Service 2" />
<dubbo:reference interface="RPC Service N" />
```

新的 Consumer 开发与配置示例：

```
<!-- 框架需要通过额外的 provided-by="provider-app-x" 才能在注册中心查询或订阅到地址列表 -->
<dubbo:registry address="zookeeper://127.0.0.1:2181?registry-type=service"/>
<dubbo:reference interface="RPC Service 1" provided-by="provider-app-x"/>
<dubbo:reference interface="RPC Service 2" provided-by="provider-app-x" />
<dubbo:reference interface="RPC Service N" provided-by="provider-app-y" />
```

以上指定 provider 应用名的方式是 Spring Cloud 当前的做法，需要 consumer 端的开发者显示指定其要消费的 provider 应用。

以上问题的根源在于注册中心不知道任何 RPC 服务相关的信息，因此只能通过应用名来查询。

为了使整个开发流程对老的 Dubbo 用户更透明，同时避免指定 provider 对可扩展性带来的影响（参见下方说明），我们设计了一套 `RPC 服务到应用名`的映射关系，以尝试在 consumer 自动完成 RPC 服务到 provider 应用名的转换。

![11](https://image.cnkirito.cn/4a92841e861c49424a2635dfb695e58ea78f70ee.png)

> Dubbo 之所以选择建立一套“接口-应用”的映射关系，主要是考虑到 service - app 映射关系的不确定性。一个典型的场景即是应用/服务拆分，如上面提到的配置``，PC Service 2 是定义于 provider-app-x 中的一个服务，未来它随时可能会被开发者分拆到另外一个新的应用如 provider-app-x-1 中，这个拆分要被所有的 PC Service 2 消费方感知到，并对应用进行修改升级，如改为``，这样的升级成本不可否认还是挺高的。
> 到底是 Dubbo 框架帮助开发者透明的解决这个问题，还是交由开发者自己去解决，当然这只是个策略选择问题，并且 Dubbo 2.7.5+ 版本目前是都提供了的。其实我个人更倾向于交由业务开发者通过组织上的约束来做，这样也可进一步降低 Dubbo 框架的复杂度，提升运行态的稳定性。

## 总结与展望

应用级服务发现机制是 Dubbo 面向云原生走出的重要一步，它帮 Dubbo 打通了与其他微服务体系之间在地址发现层面的鸿沟，也成为 Dubbo 适配 Kubernetes Native Service 等基础设施的基础。我们期望 Dubbo 在新模型基础上，能继续保留在编程易用性、服务治理能力等方面强大的优势。但是我们也应该看到应用粒度的模型一方面带来了新的复杂性，需要我们继续去优化与增强；另一方面，除了地址存储与推送之外，应用粒度在帮助 Dubbo 选址层面也有进一步挖掘的潜力。
