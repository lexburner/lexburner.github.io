---
title: Nacos 集群部署模式最佳实践
date: 2020-12-23 04:01:22
tags:
- Nacos
categories:
- Nacos
---

## 1 前言

Nacos 支持两种部署模式：单机模式和集群模式。在实践中，我们往往习惯用单机模式快速构建一个 Nacos 开发/测试环境，而在生产中，出于高可用的考虑，一定需要使用 Nacos 集群部署模式。我的上一篇文章《一文详解 Nacos 高可用特性》提到了 Nacos 为高可用做了非常多的特性支持，而这些高可用特性大多数都依赖于集群部署模式。这篇模式文章便是给大家介绍一下，在实践中可以被采用的几种集群部署模式，无论你是希望自行搭建 Nacos，还是希望对 MSE 商业版 Nacos 有一个更加深刻的理解，我都很乐意跟你分享下面的内容。

由于篇幅限制，本文不会介绍如何将一个多节点的 Nacos 集群启动起来，主要介绍的是一个多节点的 Nacos 集群启动之后，我们的应用如何很好地连接到 Nacos 集群，即客户端视角。这中间我们会引入一些其他组件以解决一些问题，本文标题也可以叫做《Nacos 接入点最佳实践》。我将会介绍以下三种方案：直连模式、 VIP 模式和地址服务器模式，并对它们进行对比。

<!-- more -->

## 2 直连模式

直连模式是部署上最简单，也是最容易理解的一种模式

![直连模式](http://kirito.iocoder.cn/image-20201224024616439.png)





采用直连模式后，典型的开发场景配置如下：

### nacos-client 配置

```java
Properties properties = new Properties();
properties.setProperty(PropertyKeyConst.SERVER_ADDR, "192.168.0.1:8848,192.168.0.2:8848,192.168.0.3:8848");
NamingService namingService = NacosFactory.createNamingService(properties);
```

注意这里的 PropertyKeyConst.SERVER_ADDR 的字面量是：`serverAddr`

### Dubbo 配置

```properties
dubbo.registry.address=192.168.0.1:8848,192.168.0.2:8848,192.168.0.3:8848
dubbo.registry.protocol=nacos
```

如果有一天，Nacos 的 IP 变了，例如扩缩容，机器置换，集群迁移等场景，所有的应用都需要修改，这样的方式并不灵活。所以这种模式并不是生产推荐的模式。

### 模式分析

- 高可用性。集群本身的扩缩容必须要改动业务代码才能被感知到，出现节点故障需要紧急下线、紧急扩容等场景，让业务修改代码是不现实的，不符合高可用的原则。
- 可伸缩性。同上，可伸缩性不友好。
- 架构简单，用户理解成本低
- 没有引入额外的组件，没有新增组件的运维成本

## 3 VIP 模式

VIP（Virtual IP） 模式可以很好的解决直连模式 IP 变化所带来的应用批量修改的问题。什么是 VIP 呢？

![VIP](http://kirito.iocoder.cn/1567916375212-f3fd5df3-1cc6-4304-aaee-c7bb564e3b79.png)

- Real Server：处理实际请求的后端服务器节点。
- Director Server：指的是负载均衡器节点，负责接收客户端请求，并转发给 RS。
- **VIP：Virtual IP，DS 用于和客户端通信的 IP 地址，作为客户端请求的目标 IP 地址。**
- DIP：Directors IP，DS 用于和内部 RS 通信的 IP 地址。
- RIP：Real IP，后端服务器的 IP 地址。
- CIP：Client IP，客户端的 IP 地址。

我这里介绍时并没有用【负载均衡模式】，而是用了【VIP 模式】，主要是为了跟 Nacos 官方文档保持一致。事实上，VIP 的叫法在阿里内部比较流行，所以在开源 Nacos 时也被习惯性的带了出去。

![VIP 模式](http://kirito.iocoder.cn/image-20201224025005872.png)

VIP 帮助 Nacos Client 屏蔽了后端 RIP，相对于 RIP 而言，VIP 很少会发生变化。以扩容场景为例，只需要让 VIP 感知到即可，Nacos Client 只需要关注 VIP，避免了扩容引起的代码改造。

只要是具备负载均衡能力的组件，均可以实现 VIP 模式，例如开源的 Nginx 以及阿里云负载均衡 SLB。

采用 VIP 模式后，代码不需要感知 RIP，典型的开发场景配置如下：

### nacos-client 配置

```java
Properties properties = new Properties();
properties.setProperty(PropertyKeyConst.SERVER_ADDR, "{VIP}:8848");
NamingService namingService = NacosFactory.createNamingService(properties);
```

### Dubbo 配置

```properties
dubbo.registry.address={VIP}:8848
dubbo.registry.protocol=nacos
```

### 域名配置

VIP 模式和直连模式都不具备可读性，所以在实际生产中，往往还会给 VIP 挂载一个域名。

域名背后甚至可以挂载 2 个 VIP 用作高可用，路由到想同的 rs；同时域名的存在也让 VIP 的置换变得更加灵活，当其中一台出现问题后，域名的 DNS 解析只会路由到另外一个正常的 VIP 上，为平滑置换预留了足够的余地。

> tips：一个域名可以绑定多个 A 记录，一个 A 记录对应一个 IPv4 类型的 VIP，DNS 域名服务器了对多个 A 记录会有负载均衡策略和健康检查机制

VIP 模式的最终生产高可用版架构便产生了：

![域名 VIP 模式](http://kirito.iocoder.cn/image-20201225013353540.png)

典型的开发场景配置只需要将 VIP 替换为域名即可

### nacos-client 配置

```java
Properties properties = new Properties();
properties.setProperty(PropertyKeyConst.SERVER_ADDR, "mse-abc123qwe-nacos.mse.aliyuncs.com:8848");
NamingService namingService = NacosFactory.createNamingService(properties);
```

### Dubbo 配置

```properties
dubbo.registry.address=mse-abc123qwe-nacos.mse.aliyuncs.com:8848
dubbo.registry.protocol=nacos
```

### 模式分析

- 高可用性。域名的可用性需要由 DNS 域名服务器负责，可用性保障较高；VIP 需要由高可用的负责均衡组件支持，且流量经过负载均衡转发，对 VIP 的实现有较高可用性的要求。
- 可伸缩性。水平扩缩容时，只需要让 VIP 感知即可，可伸缩性好。
- 依赖了域名解析系统和负载均衡系统，生产部署时，需要有配套设施的支持。

## 4 地址服务器模式

### 地址服务器介绍

说起地址服务器，可能大家对这个词会感到陌生，因为地址服务器的概念主要在阿里内部比较普及，也是阿里中间件使用的最广的一种地址寻址模式。但是在开源领域，鲜有人会提及，但对于 Nacos 部署模式而言，地址服务器模式是除了 VIP 模式之外，另外一个生产可用的推荐部署方式。

地址服务器是什么？顾名思义，是用来寻址地址的服务器，发送一个请求，返回一串地址列表。尽管在阿里内部使用的真实地址服务器比这复杂一些，但下图这个简单交互逻辑，几乎涵盖了地址服务器 90% 的内容。

![地址服务器原理](http://kirito.iocoder.cn/image-20201225015919479.png)

实现一个简易版本的地址服务器并不困难，推荐使用 nginx 搭建一个静态文件服务器管理地址， 当然你可以使用 Java！

```java
@Controller
public class AddressServerController {

    @RequestMapping("/nacos/serverlist")
    public ResponseEntity<String> serverlist() {
        return ResponseEntity.ok().
            header("Content-Type", "text/plain").
            body("192.168.0.1:8848\r\n" +
                    "192.168.0.2:8848\r\n" +
                    "192.168.0.3:8848\r\n"
            );
    }

}
```

使用地址服务器可以完成集群地址和客户端配置的解耦，解决直连模式中无法动态感知集群节点变化的问题。客户端根据地址服务器返回的列表，随后采取直连模式连接；并且在客户端启动后，会启动一个定时器，轮询感知 AddressServer 的变化，进而及时更新地址列表。

并且地址服务器建议配置域名，增加可读性。所以最后的部署交互架构是这样的：

![地址服务器部署架构](http://kirito.iocoder.cn/image-20201225025419171.png)



熟悉 RPC 的朋友看到这里应该能够很好地对 VIP 模式和地址服务器模式做一个类比。

- VIP 模式是 DNS 类的服务端负载均衡技术
- 地址服务器是类似服务发现机制的客户端负载均衡技术

nacos-client 的源码专门适配了地址服务器模式，我们只需要配置好 addressServer 的 endpoint 即可

### nacos-client 配置

```java
Properties properties = new Properties();
properties.setProperty(PropertyKeyConst.ENDPOINT, "{addressServerDomain}");
properties.setProperty(PropertyKeyConst.ENDPOINT_PORT, "8080");
NamingService namingService = NacosFactory.createNamingService(properties);
```

注意，这里 PropertyKeyConst.ENDPOINT 的字面量是：`endpoint` ，配置的是地址服务器的地址。

### Dubbo 配置

```properties
dubbo.registry.address=0.0.0.0?endpoint=127.0.0.1&endpointPort=8080
dubbo.registry.protocol=nacos
```

dubbo.registry.address 的 url 可以任意填写，因为当 serverAddr 和 endpoint 同时存在时，默认是优先从地址服务器去选址的。

此时，只需要把真实的 Nacos Server IP 配置到地址服务器中即可。

> Dubbo 通过 url 的 kv 属性将值透传给 Nacos 创建 Nacos-Client。Dubbo + Nacos 使用地址服务器模式时，建议 Dubbo 版本 >= 2.7.4，nacos-client 版本 >= 1.0.1

### 模式分析

- 高可用性。域名的可用性需要由 DNS 域名服务器负责，可用性保障较高；地址服务器的职责单一，有较高的可用性；运行时 Client 直连 Nacos Server 节点，可用性靠 nacos-sdk 保障。
- 可伸缩性。水平扩缩容时，只需要让地址服务器感知即可，可伸缩性好。
- 依赖了域名解析系统和地址服务器，生产部署时，需要有配套设施的支持。

## 5 部署模式对比

|              | 直连模式                                   | VIP 模式                                                     | 地址服务器模式                       |
| ------------ | ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------ |
| 转发模式         | 直连                                       | 代理（网络多一跳）                                           | 直连                                 |
| 高可用       | 弱，代码配置不灵活，节点故障时无法批量变更 | 强                                                           | 强                                   |
| 可伸缩性     | 弱                                         | 强                                                           | 强                                   |
| 部署成本     | 无                                         | 负载均衡组件运维成本高                                       | 地址服务器运维成本低                 |
| 负载均衡模式 | nacos-sdk 客户端负载均衡                   | 负载均衡组件提供负载均衡能力                                 | nacos-sdk 客户端负载均衡             |
| 开源接受度   | 高                                         | 高                                                           | 低，地址服务器模式在开源领域不太普遍 |
| 企业级能力   | 不方便                                     | 灵活                                                         | 灵活                                 |
| 跨网络       | 内网环境，平坦网络                         | VIP 模式灵活地支持反向代理、安全组、ACL 等特性，可以很好的工作在内/外网环境中，使得应用服务器和 Nacos Server 可以部署在不同的网络环境中，借助 VIP 打通 | 内网环境，平坦网络                   |
| 推荐使用环境 | 开发测试环境                               | 生产环境，云环境                                             | 生产环境                             |

Nacos 这款开源产品很好地支持了地址服务器这种模式，所以无论是大、中、小型公司在自建 Nacos 时，都可以选择地址服务器模式去构建生产高可用的 Nacos 集群，地址服务器组件相对而言维护简单，Nginx，Java 构建的 Web 服务器均可以轻松实现一个地址服务器。使用地址服务器后，nacos-client 与 nacos-server 之间仍然是直连访问，所以可以很好的运作在平坦网络下。

VIP 模式同样推荐在自建场景使用，但运维成本相对地址服务器还是要高一些，可以根据自己公司的运维体系评估。经过了 VIP 的转发，有利有弊。弊端比较明显，网络多了一跳，对于内网环境这样的平坦网络而言，是不必要的；优势也同样明显，大公司往往环境比较复杂，数据中心之间有网络隔离，应用和中间件可能部署在不同的网络环境中，借助于 VIP 可以很好地做网络打通，并且基于 VIP 可以很好实现安全组、ACL 等特性，更符合企业级诉求。

当然，组合使用地址服务器 + VIP 也是可以的，可以充分的融合两者的优势：

![组合模式](http://kirito.iocoder.cn/image-20201225133001525.png)

## 6 MSE Nacos 的实践

上述场景主要介绍了三种模式的具体部署方案，以及自建 Nacos 场景如何做到高可用，最后要介绍的是阿里云环境 MSE 是如何部署的。

MSE（微服务引擎）提供了 Nacos 注册中心中心的全托管能力，除了要做上述提到的高可用、可伸缩、易用性，还要考虑以下的因素：

- 开源接受度。避免给用户带来太多理解成本，尽量做到对标开源，这样用户接受度才会高。
- 网络隔离。MSE 提供的是 BaaS 化的能力，Nacos Server 部署在云产品 VPC，与用户 VPC 是隔离的，需要解决网络隔离问题。
- 网络安全。MSE Nacos 是独享模式，网络上租户隔离是最基本的要求。除此之外企业级用户会对 MSE Nacos 提出安全组/ACL 控制的诉求，这些都需要考量。

综上，MSE Nacos 最终采用的是域名 + SLB 的 VIP 模式。

![MSE 部署模式](http://kirito.iocoder.cn/image-20201225135839176.png)

MSE Nacos 提供两个域名，其中公网域名可以用做本地开发测试，或者自建环境、混合云等场景的接入点，内网域名用做阿里云生产环境接入点。公网域名有带宽限制，需要在集群创建时根据场景选择合适的带宽，而内网域名则没有带宽限制。公网域名请注意添加 IP 访问白名单。

## 7 总结

本文介绍了 Nacos 的三种部署模式，并就高可用、可伸缩、易用性等方面对各个模式进行了介绍，并对自建 Nacos 场景的部署选型进行了分析，同时介绍了 MSE Nacos 企业版的部署架构，对云环境部署 Nacos 进行了补充。

文章提及的三种模式其实也都是中间件组件常见的部署模式，不仅仅 Nacos，例如 Redis、DB 等场景，同样有参考价值。

本文提及了地址服务器这个可能在开源领域不太常见的组件，在阿里内部则用的非常普遍。

另外，Nacos 本身也提供 addressServer 模块，出于篇幅考虑没有在本文中提及，后续我会单独整理一篇文章介绍，感兴趣的同学可以自行参考 Nacos 官方文档和官方博客中的内容。