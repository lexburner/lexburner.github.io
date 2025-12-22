---
title: EDAS 让 Spring Cloud Gateway 生产可用的二三策
toc: true
type: 1
date: 2023-10-18 16:23:59
categories:
  - 网关
tags:
- Spring Cloud Gateway
---

Spring Cloud Gateway 是 Spring Cloud 微服务生态下的网关组件，一直以来备受 Java 社区的用户关注，很多企业选择使用其作为微服务网关或者业务网关。在阿里云上，也不乏有很多网关类型的产品供用户使用，例如 API Gateway 和 MSE Higress，使用 PaaS 化的方式提供网关能力，用户不再需要关注网关的实现，直接获得开箱即用的能力。在从前，用户只能选择自建 Spring Cloud Gateway，或者购买云产品，而今天介绍的 EDAS 增强 Spring Cloud Gateway 的新姿势，给用户提供了一个新的选择。

## 让 Spring Cloud Gateway 生产可用

开源 Spring Cloud Gateway 存在一些让企业级用户担忧的因素，包括内存泄漏问题，以及路由设计问题，EDAS 根据云服务总线 CSB 多年沉淀下来的 Spring Cloud Gateway 使用经验，对诸多已经存在的问题进行了治理，对诸多的风险因素也进行了规避，彻底打消用户使用 Spring Cloud Gateway 技术侧的顾虑。

-  内存泄漏问题，该问题来自于 CSB 的生产实践，Spring Cloud Gateway 底层依赖 netty 进行 IO 通信，熟悉 netty 的人应当知道其有一个读写缓冲的设计，如果通信内容较小，一般会命中 chunked buffer，而通信内容较大时，例如文件上传，则会触发内存的新分配，而 Spring Cloud Gateway 在对接 netty 时存在逻辑缺陷，会导致新分配的池化内存无法完全回收，导致堆外内存泄漏。并且这块堆外内存时 netty 使用 unsafe 自行分配的，通过常规的 JVM 工具还无法观测，非常隐蔽。 

EDAS 建议为 Spring Cloud Gateway 应用增加启动参数 `-Dio.netty.allocator.type=unpooled`，使得请求未命中 chunked buffer 时，分配的临时内存不进行池化，规避内存泄漏问题。`-Dio.netty.allocator.type=unpooled` 不会导致性能下降，只有大报文才会触发该内存的分配，而网关的最佳实践应该是不允许文件上传这类需求，加上该参数是为了应对非主流场景的一个兜底行为。

-  开源 Spring Cloud Gateway 并未提供路由配置校验能力，当路由配置出错时，可能会带来灾难性的后果，例如在配置路由时，误将 POST 写成了 PEST： `predicates: Method=PEST`，可能会导致网关中所有路由失效，爆炸半径极大。 

EDAS 建议为 Spring Cloud Gateway 应用配置 `spring.cloud.gateway.fail-on-route-definition-error: false` ，降低爆炸半径。通过 EDAS 创建的路由，将会经过校验，确保路由的格式正确，提前规避问题。

以上只是 EDAS 增强 Spring Cloud Gateway 方案的部分案例，EDAS 围绕性能、安全、稳定性等方面，全面为用户的网关保驾护航，让用户彻底回归到业务本身。

围绕让 Spring Cloud Gateway 生产可用这个基本话题，让用户在云上放心的使用 Spring Cloud Gateway，EDAS 推出了一个新的功能，使用无侵入式的方式增强 Spring Cloud Gateway。

<!-- more -->

## 功能介绍

众所周知，在 EDAS 中部署的 Java 应用都会挂载一个 Java Agent，通过 Java Agent 技术，EDAS 提供了丰富的微服务治理以及可观测性的能力，此次介绍的 Spring Cloud Gateway 增强能力，同样通过该 Java Agent 实现。

![](https://image.cnkirito.cn/image-20231016151952343.png)

EDAS 增强 Spring Cloud Gateway 带来的最直观的变化便是提供了一个白屏控制台，方便用户进行操作，同时提供了诸多的增强能力：

- 动态配置
- 自定义插件
- 路由调试
- 限流降级
- 可观测性增强

为了方便用户有一个直观的了解，本文以一个快速入门开始进行介绍

### 部署 Spring Cloud Gateway

![](https://image.cnkirito.cn/image-20231016153906037.png)

用户可以将已有的 Spring Cloud Gateway 打包成 jar 包或者镜像，在 EDAS 中进行部署，或者也可以使用 EDAS 提供 Demo 部署包进行部署。如上图所示，EDAS 新增支持了 Spring Cloud Gateway 应用的 Demo 部署包，在该部署包中，事先配置好了一个 Nacos 注册中心，会自动连接到当前部署的微服务空间，并未配置任何路由，因为接下来将会进行动态路由配置的演示，所以无需事先在配置文件中配置。整个部署过程和部署一个普通的微服务应用没有任何差异。

### 创建路由并测试

![](https://image.cnkirito.cn/image-20231016154842110.png)

EDAS 会识别到 Spring Cloud Gateway 应用的特征，并在菜单栏中动态增加应用网关的菜单。在快速入门中，示例创建了两条路由，分别是 http:// 格式的直接请求场景和 lb:// 格式的服务发现场景。为方便测试，可以在应用总览中为该网关应用配置一个公网的 SLB，通过 curl 请求测试：

```plain
~ curl 121.xx.xx.xx/httpbin/get
{
  "args": {},
  "headers": {
    "Aaa": "ccc",
    "Accept": "*/*",
    "Content-Length": "0",
    "Eagleeye-Ip": "192.168.2.1",
    "Eagleeye-Pappname": "5ae05114-bc80-4a32-9048-209b3a93d723",
    "Eagleeye-Prpc": "/httpbin/get",
    "Eagleeye-Pspanid": "-7254661991881594415",
    "Eagleeye-Root-App": "5ae05114-bc80-4a32-9048-209b3a93d723",
    "Eagleeye-Rpcid": "0.2.1",
    "Eagleeye-Sampled": "s0",
    "Eagleeye-Spanid": "-1207596966212570593",
    "Eagleeye-Traceid": "eac0a8020116974429411421021d0001",
    "Eagleeye-Userdata": "__microservice_match_result__=[]",
    "Forwarded": "proto=http;host=121.xx.xx.xx;for=\"140.xx.xx.xx\"",
    "Gfs.Scg.Ip": "192.168.2.1",
    "Host": "httpbin.org",
    "Name": "kirito,kirito",
    "User-Agent": "curl/7.64.1",
    "X-Amzn-Trace-Id": "Root=1-652cec7d-50f852f622c546f20f8997fe",
    "X-Forwarded-Host": "121.xx.xx.xx",
    "X-Forwarded-Prefix": "/httpbin"
  },
  "origin": "121.xx.xx.xx, 47.xx.xx.xx",
  "url": "http://121.xx.xx.xx/get"
}
```

网关成功转发了请求，至此路由测试完毕。

## 方案优势

以下情况，均可以考虑使用 EDAS Spring Cloud Gateway 增强方案

-  已经在使用 Spring Cloud Gateway 
-  网关存在较强的业务定制需求，例如企业级用户/权限体系对接 
-  Java 技术栈主导，希望对网关组件有自主掌控力 
-  网关后端服务使用 Spring Cloud 技术栈 

EDAS 提供的 Spring Cloud Gateway 增强方案解耦了网关的业务属性和中间件属性，用户可以专注于在 Spring Cloud Gateway 开源的基础上进行二次开发，注入复杂的业务逻辑，而将网关的功能（动态配置、限流降级等）、安全、性能等中间件属性交给 EDAS。

对于已经在使用 Spring Cloud Gateway 的用户，当 Spring Cloud Gateway 应用被 EDAS 托管后，无需改动任何代码，即可以在保留原本扩展点的同时，获得诸多的增强能力。今后依旧可以在应用基础上继续进行二次开发，使网关应用获得和业务应用一样的开发体验。传统的 PaaS 化网关在自定义扩展的支持上，一般要求用户去适配网关自身的规范，使用不熟悉的语言或者插件机制，存在一定的学习成本和风险。

如果用户目前没有网关，考虑新增一个网关，正在进行网关方案的调研，则需要针对自身的业务场景进行充分的考虑。如果符合 Java 技术栈、Spring Cloud 微服务体系等关键词，那么同样可以优先考虑该方案。

相比较阿里云上同类型的 PaaS 网关产品，他们同样有各自的使用场景，例如 API Gateway 可以实现精细化的 API 管理，MSE Higress 可以作为三合一的网关，也可以作为 K8s Ingress 的实现。可以根据自身需求来决定网关方案，EDAS 增强 Spring Cloud Gateway 的方案为用户新添了一个选型。

相比开源 Spring Cloud Gateway，EDAS Agent 增强方案在 100% 兼容开源功能的基础上，进行了以下能力的增强。

## 能力增强

### 动态配置能力

![](https://image.cnkirito.cn/image-20231016183215958.png)

EDAS 为 Spring Cloud Gateway 的路由（Route）和插件（Gateway Filter）提供了动态配置能力，以白屏化的形式呈现，方便用户进行配置。

如果 Spring Cloud Gateway 项目中已经配置了路由，例如配置在 application.yml 中，同时又在 EDAS 控制台中进行了配置，这些路由最终会合并成一份路由集合。需要注意的是 EDAS 控制台中只会展示由 EDAS 发布的路由配置，不会展示 application.yml 中的配置，但实际上这两份路由都会生效。使用该方案时，建议用户通过配置导入&导出的方式将配置迁移至 EDAS 控制台，方便统一管理。

### 配置导入&导出

![](https://image.cnkirito.cn/image-20231017095051605.png)

路由和全局插件均支持通过 Yaml 创建，Yaml 的格式遵循开源 Spring Cloud Gateway 的 schema 规范，以下是两个配置示例：

```yaml
spring:
  cloud:
    gateway:
      routes:
      # 1. 利用域名进行路由匹配，且后端是固定 HTTP URL 的场景
      - id: r-demo
        predicates:
        # 只有域名为 demo.com 的请求才会匹配上该路由
        - Host=demo.com
        filters:
        # 该插件在转发请求时，在请求头中添加 Header 键值对
        - AddRequestHeader=a,b
        # uri 里填写后端 HTTP URL
        uri: http://demo.com
        # order 代表路由的优先级，值越小，优先级越高
        order: 1000
      # 2. 利用路径前缀进行路由匹配，且后端是微服务的场景
      - id: r-demo-2
        predicates:
        # 请求路径以 /demo-2 开头，才会匹配上该路由
        - Path=/demo-2/**
        filters:
        # 该插件确保请求在转发至后端服务时，会移除掉 /demo-2 的前缀
        - StripPrefix=1
        # 后端为微服务时，uri应该以 lb:// 开头，并填写服务名
        uri: lb://service-provider
        # 可以为路由添加元数据，以在插件中使用
        metadata:
          ccc: ddd
          eee: 10
        order: 1000
```

路由 r-demo 是一个通过域名进行路由的配置示例，后端服务对应到了一个直接请求的地址，路由 r-demo-2 是一个通过路径前缀匹配路由的配置示例，配置了 StripPrefix 插件，使得在转发到后端时移除用于匹配的前缀，后端服务则是以 lb 开头，表明是服务发现发现场景。

同时也支持批量查看路由的 Yaml 定义：

![](https://image.cnkirito.cn/image-20231017095551499.png)

Yaml 创建和查看的设计，是为了尽可能地对齐到开源 Spring Cloud Gateway 的规范，如果用户是 Spring Cloud Gateway 开源的资深用户，这会保留用户原有的使用体验。

同时，借助于该功能，可以实现多套网关的配置同步，例如一批路由在测试环境验证完毕，需要迁移至生产网关，只需要将测试环境的路由选中导出，再导入至生产网关即可。

也可以借助于该功能，将用户本地配置文件中的路由导入至 EDAS，完全由 EDAS 管理，EDAS 提供的动态配置能力使用起来会更加方便。

### 插件交互

Spring Cloud Gateway 提供了非常丰富的插件（GatewayFilter）机制，允许配置在路由和全局级别，EDAS 在此基础上提升了插件的易用性。

![](https://image.cnkirito.cn/image-20231017100248106.png)

Spring Cloud Gateway 原生的插件配置采用的是精简配置的方式，对于一些不太常用的插件，很难直观地去判断如何添加参数，在 EDAS 中则没有这样的烦恼，EDAS 会将插件的解释、参数是否必填、参数含义、参数个数进行拆解，避免误用。

插件参考：

| **插件名**                 | **描述**             |
| -------------------------- | -------------------- |
| **AddRequestHeader**       | 添加请求头。         |
| **AddRequestParameter**    | 添加请求参数。       |
| **AddResponseHeader**      | 添加响应头。         |
| **SetRequestHeader**       | 修改请求头。         |
| **SetResponseHeader**      | 修改响应头。         |
| **SetStatus**              | 修改响应码。         |
| **SetPath**                | 修改请求路径。       |
| **MapRequestHeader**       | 请求头参数映射。     |
| **PrefixPath**             | 为请求路径添加前缀。 |
| **StripPrefix**            | 删除请求路径前缀。   |
| **RemoveRequestHeader**    | 删除请求头。         |
| **RemoveResponseHeader**   | 删除响应头。         |
| **RemoveRequestParameter** | 删除请求参数。       |
| **DedupeResponseHeader**   | 删除响应的重复头。   |
| **PreserveHostHeader**     | 保留请求的域名属性。 |
| **RedirectTo**             | 重定向。             |
| **RequestSize**            | 请求大小限制。       |
| **RequestHeaderSize**      | 请求头大小限制。     |
| **RewritePath**            | 重写请求路径。       |
| **RewriteResponseHeader**  | 重写响应头。         |

需要注意的一点是，这些插件是允许重复添加的，但部分插件只建议配置一次，例如 StripPrefix、SetPath 等等，否则会出现未知的表现。

### 快速测试

![](https://image.cnkirito.cn/image-20231017100933394.png)

针对于 Spring Cloud Gateway 应用，EDAS 会列举出控制台中的路由路径，供用户进行路由测试，借助于快速测试的能力，可以在路由配置完毕后快速进行验证，从而判断配置是否正确。

### 可观测

开源 Spring Cloud Gateway 并未配备网关应有的 accessLog，EDAS 补齐了这部分必备能力，任何经过网关的请求，都会打印在 `/home/admin/.opt/ArmsAgent/logs/scg-access.log` 路径下，用户可以在应用详情的日志中心中进行查看：

![](https://image.cnkirito.cn/image-20231017101531498.png)

用户可以选择将这份数据采集至 SLS 或者自定义的日志中心，用作监控。

`access.log`日志格式说明

| 编号 | 说明             | 字段名              | 内容示例                                               |
| ---- | ---------------- | ------------------- | ------------------------------------------------------ |
| 1    | 日志记录时间     | dateTime            | 2023-06-19 16:06:53 966                                |
| 2    | 请求 trace id    | traceId             | 0ab32f9f15293956139457176d485a                         |
| 3    | 客户端IP         | clientIp            | 127.0.0.1                                              |
| 4    | 请求方法         | method              | GET                                                    |
| 5    | 请求路径         | path                | /httpbin/get                                           |
| 6    | 请求数据大小     | requestSize         | 122                                                    |
| 7    | 请求开始时间     | startTime           | 1667381534546                                          |
| 8    | 匹配上的路由ID   | routeId             | sc-A                                                   |
|      | 路由对应的URI    | routeUri            | http://httpbin.org:80 、lb://sc-A                      |
| 9    | 后端调用开始时间 | backendStartTime    | 1667381534546                                          |
| 10   | 后端请求方法     | backendMethod       | GET                                                    |
| 11   | 后端请求URL      | backendUrl          | httpbin.org/get                                        |
| 13   | 后端请求体大小   | backendRequestSize  | 122                                                    |
| 14   | 后端响应码       | backendStatusCode   | 200                                                    |
| 15   | 后端响应体大小   | backendResponseSize | 433                                                    |
| 16   | 后端调用结束时间 | backendEndTIme      | 1667381534560                                          |
| 17   | 后端调用耗时     | backendRt           | 14                                                     |
| 18   | 请求响应码       | statusCode          | 200                                                    |
| 19   | 请求响应体大小   | responseSize        | 433                                                    |
| 20   | 调用是否成功     | status              | SUCCESS/FAILURE                                        |
| 21   | 错误信息         | errorMsg            | 成功时：-失败时打印具体信息，例如：Service Unavailable |
| 22   | 请求结束时间     | endTime             | 1667381534565                                          |
| 23   | 请求总耗时       | rt                  | 19                                                     |

## 后续规划

EDAS 增强 Spring Cloud Gateway 方案在后续还会提供更多的能力，丰富网关生态，目前规划中的能力包括：

- 丰富插件生态，新增鉴权、限流降级、跨域插件
- 跨微服务空间访问微服务
- 支持 Metrics 指标，提供网关资源监控和业务监控
- 单机 QOS 排查能力

欢迎用户使用反馈，与我们进行交流，钉钉交流群：23197114。

如需体验，可参考用户文档：https://help.aliyun.com/zh/edas/user-guide/spring-cloud-gateway-application-routing
