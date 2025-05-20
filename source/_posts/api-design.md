---
title: 浅析 Open API 设计规范
toc: true
type: 1
date: 2022-06-22 00:16:01
category:
- 技术杂谈
tags:
- 技术杂谈
---

## 背景

最近由于业务需求，我负责的一块系统需要对外开放 Open API，原本不是什么难事，因为阿里云内部的 Open API 开放机制已经非常成熟了，根本不需要我去设计，但这次的需求主要是因为一些原因，需要自己设计一些规范，那就意味着，需要对 Open API 进行一些规范约束了，遂有此文。

Open API 和前端页面一样，一直都是产品的门面， Open API 不规范，会拉低产品的专业性。在云场景下，很多用户会选择自建门户，对接云产品的  Open API，这对我们提出的诉求便是构建一套成熟的 Open API 机制。

站在业务角度，有一些指导原则，指导我们完善 Open API 机制：

- 前端页面使用的接口和 Open API 提供的接口是同一套接口
- 任意的前端页面接口都应该有对应的 Open API 

站在技术角度，有很多的 API 开放标准可供我们参考，一些开源产品的 Open API 文档也都非常完善。一方面，我会取其精华，另一方面，要考虑自身产品输出形态的特殊性。本文将围绕诸多因素，尝试探讨出一份合适的 Open API 开放规范。

<!-- more -->

## Open API 设计考虑因素

一个完善的 Open API 规范到底应该规范哪些东西？

站在设计角度，需要考虑：命名规范，构成规范，路径规范，出入参规范，数据类型规范，统一返回值规范，错误码规范，分页规范。

站在团队角度，团队中的后端初级中级开发以及前端研发是否有足够的经验，领悟并落地好制定的 API 规范。同时，伴随着人员流动，这份 Open API 规范是否可以很好地被传承下去。

站在行业角度，需要考虑提供 Open API 的产品所在的市场是否已经成熟，API 风格可能已经有了对应的规范。

站在产品角度，每个产品适合的 API 风格是不同的，下文会着重探讨这一角度。

总之，Open API 的设计是很难形成定论的一个东西，我在介绍自身产品最终采用的 Open API 规范之前，会先来聊一下大家耳熟能详的一些概念，例如 restful。

## restful 规范之争

有人的地方就会有江湖。

有代码的地方也是如此。

如果你在码圈混，一定听说过 restful 规范：

- 增删改查应分别声明为：POST、DELETE、PUT、PATCH、GET

- 不应该出现动词，动词统一由 HTTP Method 表示
- 体现出“资源”的抽象
- 利用 pathVariable，queryParam，header，statusCode 表达很多业务语义

restful 规范看似美好，但如果你真正尝试过落地，一定会遇到一些类似的问题：

- 以用户登录接口为例，此类接口难以映射到资源的增删改查
- 以查询最近 7 个小时内的接口请求错误率为例，衍生到诸如 graphQL 这类复杂的查询场景，往往需要 json 结构，GET 是无法实现这一点的，只有 POST 才可以传递

基于此，restful 规范逐渐有了反对的声音：

- 强行让所有的事物都“资源”化一下，有悖于开发常识，接口不一定都能够通过简单的增删改查来映射
- 复杂的查询语义不一定能够用 GET 表达

restful 风格的拥趸者，不乏对这些反对言论进行抨击，社区中不免有“拒绝 restful 风格的主要是低水平不思进取的架构师和前后端程序员们，不会设计是人的问题，不是规范的问题”此类的言论。同时对 restful 进行了升华：复杂参数的检索问题，在 restful 语义中本就应当归类为 post，因为该行为并不是对资源的定位（GET），而是对资源的检索（POST）

这显然刺激了 restful 风格反对者的神经，不屑道：呵，愚蠢的 restful 原教旨主义者呀。

不知道你是 restful 的拥趸者还是反对者？亦或是，中立者。

restful 之争暂时到此为止，这番争论纯属虚构，看官不必计较。无论你如何看待 restful，下面我的论述，你都可以作为一个中立者，否则效果减半。 

## ROA 与 RPC

API 设计并不只有 restful 一种规范，在更大的视角中，主流的 API 设计风格其实可以分为

- 面向资源的设计，即 ROA（Resource oriented architecture）
- 面向过程的设计，即 RPC（Remote Procedure Call）

restful 便是 ROA 风格的典型例子，而 RPC 风格则相对而言不太容易被大家熟知，但实际上可能大多数的系统的接口是 RPC 风格的，只不过 RPC 风格这个概念不太为人所知。

以用户模块的 CRUD 为例，对比下两个风格：

### ROA 风格

#### 创建用户（POST）

```
Request:
POST /users

{"name": "kirito", "age": 18}

Response:
HTTP 201 Created

{"id": 1, "name": "kirito", "age": 18}
```

#### 查询用户（GET）

```
Request:
GET /users/1

Response:
HTTP 200 OK

{"id": 1, "name": "kirito", "age": 18}
```

#### 查询用户列表（GET）

```
Request:
GET /users

Response:
HTTP 200 OK

{[{"id": 1, "name": "kirito", "age": 18}], "next": "/users?offset=1"}
```

#### 创建/修改用户(PUT)

```
Request:
PUT /users/1

{"name": "kirito", "age": 19}

Response:
HTTP 200 OK

{"id": 1, "name": "kirito", "age": 19}
```

#### 修改用户（PATCH）

```
Request:
PATCH /users/1

{"age": 20}

Response:
HTTP 200 OK

{"id": 1, "name": "kirito", "age": 20}
```

#### 删除用户（DELETE）

```
Request:
DELETE /users/1

Response:
HTTP 204 No Content
```

ROA 风格和 restful 规范说明的是一回事，为方便其与 RPC 风格接口的对比，特此说明上面示例的一些值得关注的点：

- 使用 HTTP 响应码（200，201，204），完成 HTTP 语义与业务语义的映射，异常流也出现 404，401 等情况（出于篇幅考虑，本文未做异常流的介绍）
- PATCH 部分修改资源，请求体是修改部分的内容；PUT 创建/修改资源，请求体是新资源全部的内容
- id 是资源定位符，而 age、name 则为属性

### RPC 风格

#### 创建用户（POST）

```
Request:
POST /user/createUser

{"name": "kirito", "age": 18}

Response:
HTTP 200 OK

{"code": 0, "message": "", "data": {"id": 1, "name": "kirito", "age": 18}}
```

#### 查询用户（POST）

```
Request:
POST /user/getUser

{"id": 1}

Response:
HTTP 200 OK

{"code": 0, "message": "", "data": {"id": 1, "name": "kirito", "age": 18}}
```

#### 查询用户列表（POST）

```
Request:
POST /user/listUsers

Response:
HTTP 200 OK

{"code": 0, "message": "", "data": {"user": [{"id": 1, "name": "kirito", "age": 18}], "next": "/user/listUsers?offset=1"}}
```

#### 修改用户(POST)

```
Request:
POST /user/modifyUser

{"id": 1, "name": "kirito", "age": 19}

Response:
HTTP 200 OK

{"code": 0, "message": "", "data": {"id": 1, "name": "kirito", "age": 19}}
```

#### 修改用户名称(POST)

```
Request:
POST /user/modifyUserAge

{"id": 1, "age": 20}

Response:
HTTP 200 OK

{"code": 0, "message": "", "data": {"id": 1, "name": "kirito", "age": 20}}
```

#### 删除用户（DELETE）

```
Request:
POST /user/deleteUser

{"id": 1}

Response:
{"code": 0, "message": ""}
```

RPC 风格不像 restful 一类的 ROA 风格存在一些约定俗称的规范，每个业务系统在落地时，都存在差异，故此处只是笔者个人的经验之谈，但愿读者能够求同存异：

- user 为模块名，不需要像 ROA 风格使用复数形式
- 使用明确的动宾结构，而不是将 CRUD 映射到 HTTP Method，HTTP Method 统一使用 POST，查询场景也可以使用 GET
- 返回值中携带 code、message 和 data，来映射响应状态及响应信息，一般可以自行定义 code 的状态码，本文使用 0 标识请求成功，message 仅在业务响应失败时有意义，data 代表业务响应结果

如何选择 RPC 和 ROA，则需要根据产品自身的业务情况进行决策。有如下的指导原则：

- 有复杂业务逻辑的 API ，无法使用简单的增、删、改、查描述时宜使用 RPC 风格。
- 如果业务所属行业标准要求 restful 风格 API 或 ROA 能够满足业务需求，宜使用 ROA 风格。

AWS 主要采用 RPC 风格，Azure、Google 主要采用 ROA（restful）风格，阿里云 OpenAPI 同时支持 RPC 和 ROA，以 RPC 为主。

尽管规范是无罪的，但在 ROA 风格在实践过程中，我还是见识过不少“坑”的：

- 要求资源先行，即先设计资源，后设计接口，对软件开发流程要求较高
- 错误的 ROA 设计案例 1：tomcat 等应用服务器在处理 DELETE 方法的 HTTP 请求时，默认不允许携带 request body，需要显式开启，导致删除失败。（此案例为设计者的问题，复杂的删除场景，不应当映射成 DELELE，而应改成 POST，DELETE 不应当携带 request body）
- 错误的 ROA 设计案例 2：restful 路径中携带的参数，可能会引发正则匹配的问题，例如误将邮箱作为路径参数，或者多级路径匹配的冲突问题（此案例为设计者的问题，复杂的查询场景，不应当映射成 GET，而应改成 POST，path 中只应该出现资源定位符，而不应当携带属性）
- 响应码为 404 时，较难区分是真的 path 不存在，还是资源不存在
- 不利于对接网关等需要配置路由转发的场景

我负责的产品所需要的 Open API 规范需要满足以下的需求：

- 后端开发设计接口时，有明确的设计思路，不至于因为一个接口到底用 POST 还是 GET 实现而纠结，不用花费太多时间在资源的抽象上（这并不是说明资源是不需要被设计的）
- 前端开发对接接口时，能够较快地与后端协同，并且利于前端接口的封装
- 用户对接 Open API 时，整体风格一致，模块清晰

综上，在设计风格选择上，我计划采取 RPC 的设计规范。总结一下 RPC 风格的优势：

- 满足独立输出，CNStack、企业版、公安部的规范
- API 设计难度较低，容易落地
- 阿里云大多数成熟的 IAAS 层产品使用 RPC 规范
- 适合复杂业务场景

## 一个详细的 RPC 接口文档示例

### 创建服务

#### 请求参数

| 序号 | 字段中文名 | 字段英文名   | 数据类型 | 必填 | 说明                                                         |
| ---- | ---------- | ------------ | -------- | ---- | ------------------------------------------------------------ |
| 1    | 名称       | name         | string   | 是   | 显示名称                                                     |
| 2    | 协议       | protocol     | string   | 是   | 枚举值：http/grpc/webservice                                 |
| 3    | 负载均衡   | lb           | string   | 是   | 枚举值：random/roundrobin                                    |
| 4    | 上游类型   | upstreamType | string   | 是   | 枚举值：fixed/discovery                                      |
| 5    | 节点列表   | nodes        | array    | 否   | upstreamType=fixed 时必填，示例：[{"host": "1.1.1.1","port": "80","weight": "1"}] |
| 6    | 来源id     | originId     | string   | 否   |                                                              |
| 7    | 服务名称   | serviceName  | string   | 否   | 注册中心中的名称，upstreamType=discovery 时必填              |
| 8    | 服务描述   | description  | string   | 否   |                                                              |
| 9    | 网关id     | gatewayId    | string   | 是   |                                                              |

#### 返回参数

| 序号 | 字段中文名 | 字段英文名 | 数据类型 | 说明                   |
| ---- | ---------- | ---------- | -------- | ---------------------- |
| 1    | 响应码     | code       | int      | 0 标识成功；1 标识失败 |
| 2    | 响应信息   | message    | string   |                        |
| 3    | 响应结果   | data       | string   | 返回服务 id            |

#### 请求示例

```json
POST /service/createService

Request:
{
  "name": "httpbin",
  "protocol": "http",
  "lb": "random",
  "upstreamType": "fixed",
  "nodes": [
    {
      "host": "httpbin.org",
      "port": "80",
      "weight": "1"
    }
  ],
  "gatewayId": "gw-1qw2e3e4"
}

Response:
{
  "code": 0,
  "message": "",
  "serviceId": "s-1qw2e3e4"
}
```

## API 命名规范

- API 应使用拼写正确的英文，符合语法规范，包括单复数、时态和语言习惯
- 不能出现多个含义相近但功能无实际差别的 API，如同时存在 /user/getUser 和 /user/describeUser
- 语言习惯：禁止使用拼音
- 如下常见场景的命名规则是固定的
  - 日期时间类型的参数应命名为 XxxxTime。例如：CreateTime

- 常用操作名称规范
  - *create：创建*
  - *modify：变更*
  - *delete：删除*
  - *get：获取单个资源详情*
  - *list：获取资源列表*
  - *establishRelation：建立资源关系*
  - *destroyRelation：销毁资源关系*

## 总结

以本文推崇的一条规范为例："所有接口全部使用 POST"，这不是为了迁就低水平不思进取的架构师和前后端程序员们（我在社区论坛上看到的言论），而是为了提高开发效率，降低沟通成本，降低运维和错误定位成本，把瞎折腾的成本，投入到了其他比如业务架构设计，测试体系，线上监控，容灾降级等领域上。

接口规范也并非我总结的那样，只有 RPC 和 ROA，也有一些言论将 GraphQL 单独归为一类 API 设计风格，用于复杂查询场景，有兴趣的同学可以参考 es 的 API 文档。

综上，我计划采用 RPC 的 API 设计风格。

## 参考资料

kong：https://docs.konghq.com/gateway/2.8.x/admin-api/

google restful api design：https://cloud.google.com/apis/design?hl=zh-cn

https://www.zhihu.com/question/336797348
