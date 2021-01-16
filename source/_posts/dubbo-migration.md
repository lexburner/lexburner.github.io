---
title: 平滑迁移 Dubbo 服务的思考
date: 2020-05-30 23:17:38
tags:
- Dubbo
categories:
- RPC
---

## 前言

近日，有报道称在 HashCorp 的商业软件试用协议上发现，旗下所有商业产品禁止在中国境内使用、部署、安装，这其中就包含了 Terraform, Consul, Vagrant 等众多知名软件，其中 Consul 是一个在微服务领域的开源软件，可以用于做注册发现、配置管理等场景。

该新闻在国内发酵后，有人在 Twitter上咨询了HashCorp 公司的创始人，得到的回复是影响的软件仅限于 Vault 这款加密软件，目前 HashCorp 公司的官方网站上已经更新了相关的条款，明确了受影响的产品仅限 Vault 这一款产品。

## Consul 开源版是否收到影响？

上面的条款里只提到了商业软件，那么开源的 Consul 是否受到影响呢？在 Github 的 Consul 仓库上，可以得知项目的 license 是 `Mozilla Public License 2.0` ，这款许可证在 Apache 官网上是 `Category B` , 属于 `Weak Copy Left` 许可，那么它有哪些特点呢？

![License](https://kirito.iocoder.cn/1590754178611.png)

1. 任何可以使用，复制，修改，重新分发该代码，包括商业目的使用。
2. 如果修改了 MPL 协议许可下的源码，再重新发布这部分源码的话，必须保留原来 MPL 许可证不得更换。
3. 如果基于该项目衍生出更大的项目，那么这部分工作可以使用新许可证的方式进行分发，只要没有修改原来 MPL 许可下的代码。（这也是为什么 Apache 项目的分发的源码中可以包含 MPL 协议下二进制文件的原因）

可以看到，MPL 通常被认为是介于 Apache License 和 GPL/LGPL 之间的一个折中方案。相对于 Apache License，MPL 2.0 要求修改了源码必须保持相同协议；相对于 GPL/LGPL, MPL 2.0 可以商用，同时衍生的作品在一定条件下也可以更换许可证类型。

总体来看的话，开源版 Consul 无论是私用还是商用都是不受限制的。但这也可能是一个警钟，如果对 Consul 还是有所顾忌的话，如何替代掉它呢？

在微服务领域，Consul 主要被用来做充当注册中心和配置中心，例如 Dubbo 和 SpringCloud 都有对应的支持。本文便以这个事为一个引子，介绍如何平滑地迁移 Dubbo 服务，达到替换注册中心的效果。

<!-- more -->

## 平滑迁移服务的定义和意义

如果 Dubbo 应用已经部署到生产环境并处于正常运行状态中，此时想将应用的注册中心替换，那么在迁移过程中，保证业务的平稳运行不中断一定是第一要义。我们将保证应用运行不中断，并最终达成注册中心替换的过程称为平滑迁移。可以类比为给飞行中的飞机替换引擎，在项目升级、框架调整等很多时候，现状和终态之间往往都有一个过度方案。

- 平滑迁移可以避免终态方案一次性上线后出现和原有方案的不兼容性，规避了整体回归的风险

- 没有哪个互联网公司可以承担的起：“自 xx 至 xx，系统维护一小时，期间服务将无法提供，请广大用户谅解” 这种停机升级方案。

## 平滑迁移过程

说到注册中心迁移，可能很多人第一时间都能想到双注册双订阅这种方案

> 双注册和双订阅迁移方案是指在应用迁移时同时接入两个注册中心（原有注册中心和新注册中心）以保证已迁移的应用和未迁移的应用之间的相互调用。

以 Consul 迁移到 Nacos 为例：

在迁移态下，一共有两种应用类型：未迁移应用，迁移中应用。我们所说的双注册双订阅都是指的【迁移中应用】。明白下面几个点，平滑迁移的过程一下子就清晰了：

- 【未迁移应用】不做任何改动
- 为了让【未迁移应用】调用到【迁移中应用】，要求【迁移中应用】不仅要将数据写到 Nacos，还要写回旧的 Consul，这是双注册
- 为了让【迁移中应用】调用到【未迁移应用】，要求【迁移中应用】不仅要订阅 Nacos 的数据，还要监听旧的 Consul，这是双订阅

- 当所有应用变成【迁移中应用】时，旧的 Consul 就可以光荣下岗了，至此平滑迁移完成。

在这个过程中，还可以灵活的变换一些规则，例如在迁移中后期，大部分应用在 Nacos 中已经有服务了，可以切换双订阅为单订阅，以验证迁移情况。并且在真实场景下，还会并存配置中心、元数据中心的迁移，过程会更加复杂。

## Dubbo 平滑迁移方案 -- 多注册中心

Dubbo 多注册中心配置文档地址：http://dubbo.apache.org/zh-cn/docs/user/demos/multi-registry.html

本文的完整代码示例将会在文末提供，其中 Consul 注册中心搭建在本地，而 Nacos 注册中心使用的是阿里云的云产品：微服务引擎 MSE，其可以提供托管的 Nacos/Zookeeper/Eureka 等集群。

Dubbo 支持多注册中心的配置，这就为我们平滑迁移提供了很多的便利性。在使用 dubbo-spring-boot-starter 时，只需要增加如下的配置，即可配置多注册中心：

```properties
dubbo.registries.first.protocol=consul
dubbo.registries.first.address=localhost:8500

dubbo.registries.second.protocol=nacos
dubbo.registries.second.address=mse-kirito-p.nacos-ans.mse.aliyuncs.com:8848
```

在 Consul 控制台可以看到服务已经注册成功：

![Consul](https://kirito.iocoder.cn/222.png)

在 MSE 控制台可以看到 Nacos 服务也已经注册成功

![MSE Nacos](https://kirito.iocoder.cn/111.png)

并且，服务调用一切正常。你可能回想：前面讲了一堆，你告诉我改了两行配置就是平滑迁移了？我还是得好好纠正下这种想法，改代码从来都是最轻松的事，难的是在迁移中，时刻观察业务状况，确保服务不因为迁移有损。除此之外，还需要注意的是，Dubbo 自带的多注册中心方案因为框架实现的问题，存在一定的缺陷。

## Dubbo 多注册中心的缺陷

在 Dubbo 的实现中，多个注册中心的地址是隔离的，地址不会融合。也就是说，当消费者如下配置后：

```properties
dubbo.registries.first.protocol=consul
dubbo.registries.first.address=localhost:8500

dubbo.registries.second.protocol=nacos
dubbo.registries.second.address=mse-kirito-p.nacos-ans.mse.aliyuncs.com:8848
```

会永远优先从 Consul 中读取服务地址，除非 Consul 中没有服务，才会尝试从 Nacos 中读取，顺序取决于配置文件中注册中心声明的先后。这可能不符合大多数人对多注册中心的直观认知，但没办法，Dubbo 就是这么设计的，我也尝试猜想了几个这么设计的可能性：

- 多个注册中心没有感知到对方存在的必要，所以只能串行读取多个注册中心
- Dubbo 本身模型不支持注册中心聚合，除非专门搞一个 AggregationRegistry 代理多个注册中心实现
- 多个注册地址的 equals 方案难以确定，官方没有给出契约规范，即 ip 和 port 相同就可以认为同一个地址吗？
- Dubbo 的多注册中心的设计并不只是为了适配平滑迁移方案，其他场景可能恰恰希望使用这种串行读取的策略

为了让读者有一个直观的感受，我用文末的 demo 进行了测试，让服务提供者 A1（端口号 12346） 只注册到 Nacos，服务提供者 A2（端口号为 12345） 只注册到 Consul，消费者 B 双订阅 Nacos 和 Consul。如下图所示，在测试初期，可以发现，稳定调用到 A1；期间，我手动 kill 了 A1，图中也清晰地打印出了一条地址下线通知，之后稳定调用到 A2。

![multi-registry](https://kirito.iocoder.cn/image-20200531012739193.png)

这样的缺陷，会导致我们在平滑迁移过程中无法对未迁移应用和迁移中应用进行充分的测试。

## Dubbo 平滑迁移方案 -- 注册中心聚合

注册中心聚合这个词其实是我自己想的，因为 Dubbo 官方文档并没有直接给出这种方案，而是由阿里云的微服务商业化 EDAS 团队提供的开源实现（ps，没错，就是我所在的团队啦）。其基本思路就是前文提到的，聚合多个注册中心的地址。使用方式也同样简单

引入依赖：

```xml
<dependency>
    <groupId>com.alibaba.edas</groupId>
    <artifactId>edas-dubbo-migration-bom</artifactId>
    <version>2.6.5.1</version>
    <type>pom</type>
</dependency>  
```

增加配置：

在 `application.properties` 中添加注册中心的地址。

```
dubbo.registry.address = edas-migration://30.5.124.15:9999?service-registry=consul://localhost:8500,nacos://mse-kirito-p.nacos-ans.mse.aliyuncs.com:8848&reference-registry=consul://localhost:8500,nacos://mse-kirito-p.nacos-ans.mse.aliyuncs.com:8848         
```

**说明** 如果是非 Spring Boot 应用，在 dubbo.properties 或者对应的 Spring 配置文件中配置。

- ```
  edas-migration://30.5.124.15:9999
  ```

  多注册中心的头部信息。可以不做更改，ip 和 port 可以任意填写，主要是为了兼容 Dubbo 对 ip 和 port 的校验。启动时，如果日志级别是 WARN 及以下，可能会抛一个 WARN 的日志，可以忽略。

- ```
  service-registry
  ```

  服务注册的注册中心地址。写入多个注册中心地址。每个注册中心都是标准的 Dubbo 注册中心格式；多个用`,`分隔。

- ```
  reference-registry
  ```

  服务订阅的注册中心地址。每个注册中心都是标准的 Dubbo 注册中心格式；多个用`,`分隔。

验证该方案：

![migration](https://kirito.iocoder.cn/image-20200531015410936.png)

已经变成了随机调用，解决了多注册中心的缺陷。

迁移完成后，建议删除原注册中心的配置和迁移过程专用的依赖`edas-dubbo-migration-bom`，在业务量较小的时间分批重启应用。`edas-dubbo-migration-bom` 是一个迁移专用的依赖，虽然长期使用对您业务的稳定性没有影响，但其并不会跟随 Dubbo 的版本进行升级，为避免今后框架升级过程中出现兼容问题，推荐您在迁移完毕后清理掉，然后在业务量较小的时间分批重启应用。

> 说明：edas-dubbo-migration-bom 目前的 release 版本只支持 Dubbo 2.6，我在文末的代码中提供了 2.7 的支持，预计很快两个版本都会贡献给 Dubbo 开源社区。

## 彩蛋：阿里云微服务引擎 MSE 重磅升级，上线微服务治理中心

微服务治理中心是一个面向开源微服务框架微服务中心，通过 Java Agent 技术使得您的应用无需修改任何代码和配置，即可享有阿里云提供的微服务治理能力。 已经上线的功能包含 服务查询、无损下线、服务鉴权、离群实例摘除、标签路由。

微服务治理中心具有如下优势：功能强大，覆盖和增强了开源的治理功能，还提供差异化的功能。零成本接入，支持近五年的 Spring Cloud 和 Dubbo 版本，无需修改任何代码和配置。易被集成，阿里云容器服务用户只需在应用市场安装 微服务中心对应的 pilot ，并修改部署时的配置即可接入。

微服务中心尤其适合以下场景

- 解决应用发布时影响业务的问题。如果您的应用在发布新版本的时候，此应用的服务消费者仍旧调用已经下线的节点，出现业务有损，数据不一致的情况。这时候您需要使用 微服务治理中心，微服务治理中心提供的无损下线功能能够实现服务消费者及时感知服务提供者下线情况，保持业务连续无损。容器服务 K8s 集群的应用在接入 微服务治理中心后，您无需再额外对应用进行任何配置、也无需在 MSC 控制台进行任何操作，即可实现 Dubbo 和 Spring Cloud 流量的无损下线。
- 满足应用调用中权限控制的需求。当您的某个微服务应用有权限控制要求，不希望其它所有应用都能调用。比如优惠券部门的优惠券查询接口是默认内部的部门都是可以调用的，但是优惠券发放接口只允许特定的部门的应用才可以调用。这时候您需要使用 微服务治理中心，微服务治理中心提供的服务鉴权功能，既能够对整个应用做一些权限控制，也能对应用中的某个接口和 URL 进行权限控制，满足您不同场景下的权限控制需求
- 解决不健康实例影响业务对问题，当节点出现 Full GC、网络分区、机器异常等问题时，这种情况下会导致调用此应用的流量出现异常、影响业务。但是运维人员又很难及时发现问题，且无法判断应该采取何种措施，如重启或者单纯地等待应用恢复。这时候您需要使用微服务治理中心，微服务治理中心 提供的离群实例摘除功能，能够根据您配置的规则自动摘服务调用列表中不健康的应用实例，以免异常的节点影响您的业务。同时还能自动地探测实例是否恢复并恢复流量，以及将实例异常信息触发监控报警，保护您的业务，提升稳定性。

![MSC](https://kirito.iocoder.cn/1590756935648.png)

## 附录

本文测试代码地址：https://github.com/lexburner/dubbo-migration

![img](https://www.cnkirito.moe/css/images/wechat_public.jpg)

*「技术分享」**某种程度上，是让作者和读者，不那么孤独的东西。**欢迎关注我的微信公众号：**「**Kirito的技术分享」*