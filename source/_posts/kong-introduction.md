---
title: 选择KONG作为你的API网关
date: 2018-07-12 19:47:28
tags:
- KONG
categories:
- KONG
---

![img](https://camo.githubusercontent.com/9e4fe7914c7357861223aa535d7ca9858253c96e/68747470733a2f2f6b6f6e6768712e636f6d2f77702d636f6e74656e742f75706c6f6164732f323031382f30352f6b6f6e672d6c6f676f2d6769746875622d726561646d652e706e67)

> Kong（https://github.com/Kong/kong）是一个云原生，高效，可扩展的分布式 API 网关。 自 2015 年在 github 开源后，广泛受到关注，目前已收获 1.68w+ 的 star，其核心价值在于高性能和可扩展性。

### 为什么需要 API 网关

![img](https://camo.githubusercontent.com/d4d0dcb22c223db0bf2e301aab0dddb3015f1729/68747470733a2f2f6b6f6e6768712e636f6d2f77702d636f6e74656e742f75706c6f6164732f323031382f30352f6b6f6e672d62656e65666974732d6769746875622d726561646d652e706e67)

在微服务架构之下，服务被拆的非常零散，降低了耦合度的同时也给服务的统一管理增加了难度。如上图左所示，在旧的服务治理体系之下，鉴权，限流，日志，监控等通用功能需要在每个服务中单独实现，这使得系统维护者没有一个全局的视图来统一管理这些功能。API 网关致力于解决的问题便是为微服务纳管这些通用的功能，在此基础上提高系统的可扩展性。如右图所示，微服务搭配上 API 网关，可以使得服务本身更专注于自己的领域，很好地对服务调用者和服务提供者做了隔离。

### 为什么是 Kong

SpringCloud 玩家肯定都听说过 Zuul 这个路由组件，包括 Zuul2 和 Springcloud Gateway 等框架，在国内的知名度都不低。没错，我称呼这些为组件 Or 框架，而 Kong 则更衬的上产品这个词。在此我们可以简单对比下 Zuul 和 Kong。

举例而言，如果选择使用 Zuul，当需要为应用添加限流功能，由于 Zuul 只提供了基本的路由功能，开发者需要自己研发 Zuul Filter，可能你觉得一个功能还并不麻烦，但如果在此基础上对 Zuul 提出更多的要求，很遗憾，Zuul 使用者需要自行承担这些复杂性。而对于 Kong 来说，限流功能就是一个插件，只需要简单的配置，即可开箱即用。

Kong 的插件机制是其高可扩展性的根源，Kong 可以很方便地为路由和服务提供各种插件，网关所需要的基本特性，Kong 都如数支持：

- **云原生**: 与平台无关，Kong可以从裸机运行到Kubernetes
- **动态路由**：Kong 的背后是 OpenResty+Lua，所以从 OpenResty 继承了动态路由的特性
- **熔断**
- **健康检查** 
- **日志**: 可以记录通过 Kong 的 HTTP，TCP，UDP 请求和响应。
- **鉴权**: 权限控制，IP 黑白名单，同样是 OpenResty 的特性
- **SSL**: Setup a Specific SSL Certificate for an underlying service or API.
- **监控**: Kong 提供了实时监控插件
- **认证**: 如数支持 HMAC, JWT, Basic, OAuth2.0 等常用协议
- **限流**
- **REST API**: 通过 Rest API 进行配置管理，从繁琐的配置文件中解放
- **可用性**: 天然支持分布式
- **高性能**: 背靠非阻塞通信的 nginx，性能自不用说
- **插件机制**: 提供众多开箱即用的插件，且有易于扩展的自定义插件接口，用户可以使用 Lua 自行开发插件

上面这些特性中，反复提及了 Kong 背后的 OpenResty，实际上，使用 Kong 之后，Nginx 可以完全摒弃，Kong 的功能是 Nginx 的父集。

而 Zuul 除了基础的路由特性以及其本身和 SpringCloud 结合较为紧密之外，并无任何优势。

### Kong 的架构

![image-20180712184740981](http://ov0zuistv.bkt.clouddn.com/image-20180712184740981.png)



从技术的角度讲，Kong 可以认为是一个 OpenResty 应用程序。 OpenResty 运行在 Nginx 之上，使用 Lua 扩展了 Nginx。 Lua 是一种非常容易使用的脚本语言，可以让你在 Nginx 中编写一些逻辑操作。之前我们提到过一个概念 Kong = OpenResty + Nginx + Lua，但想要从全局视角了解 Kong 的工作原理，还是直接看源码比较直接。我们定位到本地的 Kong 文件夹，按照上图中的目录层级来识识 Kong 的庐山真面目。

1. Kong 文件下包含了全部源码和必要组件，分析他们，我们便得到了 Kong 的架构。0.13.x 是目前 Kong 的最新版本。
2. 从 2 号块中可以看到 nginx.conf ，这其实便是一个标准的 Nginx 目录结构，这也揭示了 Kong 其实就是运行在 Nginx 的基础之上，而进行的二次封装。由 share 文件夹向下展开下一次分析。
3. share 文件夹中包含了 OpenResty 的相关内容，其实背后就是一堆 Lua 脚本，例如 lapis 包含了数据库操作，Nginx 生命周期，缓存控制等必要的 Lua 脚本，logging 包含了日志相关的 Lua 脚本，resty 包含了 dns，健康检查等相关功能的 Lua 脚本…而其中的 kong 目录值得我们重点分析，他包含了 Kong 的核心对象。
4. api 和 core 文件夹，封装了 Kong 对 service，route，upstream，target 等核心对象的操作代码（这四个核心对象将会在下面的小节重点介绍），而 plugins 文件夹则是 Kong 高可扩展性的根源，存放了 kong 的诸多扩展功能。
5. plugins 文件夹包含了上一节提到的 Kong 的诸多插件功能，如权限控制插件，跨域插件，jwt 插件，oauth2 插件...如果需要自定义插件，则需要将代码置于此处。

从上述文件夹浏览下来，大概可以看到它和 Nginx 的相似之处，并在此基础之上借助于 Lua 对自身的功能进行了拓展，除了 nginx.conf 中的配置，和相对固定的文件层级，Kong 还需要连接一个数据库来管理路由配置，服务配置，upstream 配置等信息，是的，由于 Kong 支持动态路由的特性，所以几乎所有动态的配置都不是配置在文件中，而是借助于 Postgres 或者 Cassandra 进行管理。

![postgres](http://ov0zuistv.bkt.clouddn.com/image-20180712192742718.png)

Kong 对外暴露了 Restful API，最终的配置便是落地在了数据库之中。

### Kong 的管理方式

通过文件夹结构的分析，以及数据库中的表结构，我们已经对 Kong 的整体架构有了一个基本的认识，但肯定还存在一个疑问：我会配置 Nginx 来控制路由，但这个 Kong 应当怎么配置才能达到相同的目的呢？莫急，下面来看看 Kong 如何管理配置。

Kong 简单易用的背后，便是因为其所有的操作都是基于 HTTP Restful API 来进行的。

![kong端点](http://blog.didispace.com/content/images/posts/hzf-ms-apigateway-2-9.png)

其中 8000/8443 分别是 Http 和 Https 的转发端口，等价于 Nginx 默认的 80 端口，而 8001 端口便是默认的管理端口，我们可以通过 HTTP Restful API 来动态管理 Kong 的配置。

**一个典型的 Nginx 配置**

```Nginx
upstream helloUpstream {
	server localhost:3000 weight=100;
}

server {
	listen	80;
	location /hello {
		proxy_pass http://helloUpstream;
	}
}
```

如上这个简单的 Nginx 配置，便可以转换为如下的 Http 请求。

**对应的 Kong 配置**

```Shell
# 配置 upstream
curl -X POST http://localhost:8001/upstreams --data "name=helloUpstream"
# 配置 target
curl -X POST http://localhost:8001/upstreams/hello/targets --data "target=localhost:3000" --data "weight=100"
# 配置 service
curl -X POST http://localhost:8001/services --data "name=hello" --data "host=helloUpstream"
# 配置 route
curl -X POST http://localhost:8001/routes --data "paths[]=/hello" --data "service.id=8695cc65-16c1-43b1-95a1-5d30d0a50409"
```

这一切都是动态的，无需手动 reload nginx.conf。

我们为 Kong 新增路由信息时涉及到了 upstream，target，service，route 等概念，他们便是 Kong 最最核心的四个对象。（你可能在其他 Kong 的文章中见到了 api 这个对象，在最新版本 0.13 中已经被弃用，api 已经由 service 和 route 替代）

从上面的配置以及他们的字面含义大概能够推测出他们的职责，**upstream 是对上游服务器的抽象；target 代表了一个物理服务，是 ip + port 的抽象；service 是抽象层面的服务，他可以直接映射到一个物理服务(host 指向 ip + port)，也可以指向一个 upstream 来做到负载均衡；route 是路由的抽象，他负责将实际的 request 映射到 service**。

他们的关系如下

upstream 和 target ：1 对 n

service 和 upstream ：1 对 1 或 1 对 0 （service 也可以直接指向具体的 target，相当于不做负载均衡）

service 和 route：1 对 n

### 高可扩展性的背后—插件机制

Kong 的另一大特色便是其插件机制，这也是我认为的 Kong 最优雅的一个设计。

文章开始时我们便提到一点，微服务架构中，网关应当承担所有服务共同需要的那部分功能，这一节我们便来介绍下，Kong 如何添加 jwt 插件，限流插件。

插件（Plugins）装在哪儿？对于部分插件，可能是全局的，影响范围是整个 Kong 服务；大多数插件都是装在 service 或者 route 之上。这使得插件的影响范围非常灵活，我们可能只需要对核心接口进行限流控制，只需要对部分接口进行权限控制，这时候，对特定的 service 和 route 进行定向的配置即可。

为 hello 服务添加50次/秒的限流

```shell
curl -X POST http://localhost:8001/services/hello/plugins \
--data "name=rate-limiting" \
--data "config.second=50"
```

为 hello 服务添加 jwt 插件

```shell
curl -X POST http://localhost:8001/services/login/plugins \
--data "name=jwt"
```

同理，插件也可以安装在 route 之上

```shell
curl -X POST http://localhost:8001/routes/{routeId}/plugins \
--data "name=rate-limiting" \
--data "config.second=50"

curl -X POST http://localhost:8001/routes/{routeId}/plugins \
--data "name=jwt"
```

在官方文档中，我们可以获取全部的插件 https://konghq.com/plugins/，部分插件需要收费的企业版才可使用。

![kong插件](http://ov0zuistv.bkt.clouddn.com/image-20180712200520739.png)

### 总结

Kong 是目前市场上相对较为成熟的开源 API 网关产品，无论是性能，扩展性，还是功能特性，都决定了它是一款优秀的产品，对 OpenResty 和 Lua 感兴趣的同学，Kong 也是一个优秀的学习参考对象。基于 OpenResty，可以在现有 Kong 的基础上进行一些扩展，从而实现更复杂的特性，比如我司内部的 ABTest 插件和定制化的认证插件，开发成本都相对较低。Kong 系列的文章将会在以后持续连载。



**Kirito 有话说：感谢阅读，为了博主更好地创作，提供更多的原创文章，请大家务必！务必！帮我点击阅读一下明天即将发出来的公众号文章！！！**



---

阅读扩展

初识 Kong 之负载均衡 https://www.cnkirito.moe/kong-loadbalance/ 

Kong 集成 Jwt 插件 https://www.cnkirito.moe/kong-jwt/

