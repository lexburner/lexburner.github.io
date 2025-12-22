---
title: 警惕 Spring Boot Actuator 引发的安全漏洞
toc: true
type: 1
date: 2021-04-07 23:25:34
categories:
  - 微服务
tags: Spring
---

## 前言

一年一度的 HW 行动开始了，最近也是被各种安全漏洞搞的特别闹心，一周能收到几十封安全团队扫描出来的漏洞邮件，这其中有一类漏洞很容易被人忽视，但影响面却极广，危害也极大，我说出它的名字你应该也不会感到陌生，正是 `Spring Boot Actuator` 。

写这篇文章前，我跟我的朋友做了一个小调查，问他们对 `Spring Boot Actuator` 的了解，结果惊人的一致，大家都知道 Spring Boot 提供了 `spring-boot-starter-actuator` 的自动配置，但却很少有人真正用到它相关的特性。在继续往下面看这篇文章时，大家也可以先思考下几个问题：

1. 检查下你开发的项目中有引入  `spring-boot-starter-actuator` 依赖吗？
2. 你在项目中有真正用到 `spring-boot-starter-actuator` 的有关功能吗？
3. 你知道 `spring-boot-starter-actuator` 的安全风险和正确配置方式吗？

<!-- more -->

## Spring Boot Actuator 是什么？

好久没翻过 spring 的文档了，为了解释这个还算陌生的名词 Actutor [ˈæktjuˌeɪtər]，我特地去翻了下[它的文档](https://docs.spring.io/spring-boot/docs/current/reference/html/production-ready-features.html#production-ready)，找到了官方的定义

> Definition of Actuator
> An actuator is a manufacturing term that refers to a mechanical device for moving or controlling something. Actuators can generate a large amount of motion from a small change.

好家伙，看了等于白看，以我 CET-6 的水平，理解这段话着实有点难度，希望能有英语比较好的同学帮我翻译下。只能按照我个人对 Spring Boot Actuator 功能的理解来意译下了：我们可以借助于 Spring Boot Actuator 来对 Spring Boot 应用的健康状态、环境配置、Metrics、Trace、Spring 上下文等信息进行查看，除了一系列查看功能之外，它还实现了 Spring Boot 应用的上下线和内存 dump 功能。 

## Quick Start

### 第一步 引入依赖

> tips：spring-boot-starter-actuator 在不同版本 Spring Boot 中有一定的配置差异，本文采用的是目前最新的 2.4.4 版本

```xml pom.xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
    <version>2.4.4</version>
</dependency>
```

### 第二步 了解 endpoint

endpoint 是我们使用 `Spring Boot Actuator` 最需要关心的对象，列举一些你可能感兴趣的 endpoint

| ID          | Description                                      |
| ----------- | ------------------------------------------------ |
| beans       | 查看 Spring 容器中的所有对象                     |
| configprops | 查看被 `@ConfigurationProperties` 修饰的对象列表 |
| env         | 查看 application.yaml 配置的环境配置信息         |
| health      | 健康检查端点                                     |
| info        | 应用信息                                         |
| metrics     | 统计信息                                         |
| mappings    | 服务契约 `@RequestMapping` 相关的端点            |
| shutdown    | 优雅下线                                         |

例如 `health`，只需要访问如下 endpoint 即可获取应用的状态

```shell info
curl "localhost:8080/actuator/health"
```

### 第三步 了解 endpoint 的 enable 和 exposure 状态

`Spring Boot Actuator` 针对于所有 endpoint 都提供了两种状态的配置

- enabled 启用状态。默认情况下除了 `shutdown` 之外，其他 endpoint 都是启用状态。这也很好理解，其他 endpoint 基本都是查看行为，shutdown 却会影响应用的运行状态。
- exposure 暴露状态。endpoint 的 enabled 设置为 true 后，还需要暴露一次，才能够被访问，默认情况下只有 health 和 info 是暴露的。

enabled 不启用时，相关的 endpoint 的代码完全不会被 Spring 上下文加载，所以 enabled 为 false 时，exposure 配置了也无济于事。

几个典型的配置示例如下

启用并暴露所有 endpoint

```yaml 暴露所有 endpoint
management:
  endpoints:
    web:
      exposure:
        include: "*"
  endpoint:
    shutdown:
      enabled: true
```

只启用并暴露指定 endpoint

```yaml 只启用并暴露指定 endpoint
management:
  endpoints:
    enabled-by-default: false
  endpoint:
    info:
      enabled: true
  endpoints:
    web:
      exposure:
        include: "info"
```

禁用所有 endpoint

```yaml 禁用所有 endpoint
management:
  endpoints:
    enabled-by-default: false
```

或者，去除掉 `spring-boot-starter-actuator` 依赖！

## 了解 Spring Boot Actuator 的安全风险

从上文的介绍可知，有一些 `Spring Boot Actuator` 提供的 endpoint 是会将应用重要的信息暴露出去的，以 `env` 为例来感受下一个典型的 `application.yaml` 的示例。

```yaml application.yaml
server:
  port: 8080
spring:
  datasource:
  	url: jdbc:mysql://testDbHost:3306/kirito
    username: kirito
    password: 123456
kirito:
  ak: kirito@xxx_ak
  sk: kirito@xxx_sk
management:
  endpoints:
    web:
      exposure:
        include: "*"
```

上面的配置再经典不过，我们看看访问 `localhost:8080/actuator/env` 之后的返回值

```json localhost:8080/actuator/env
{
  "activeProfiles": [],
  "propertySources": [
    {
      "name": "server.ports",
      "properties": {
        "local.server.port": {
          "value": 8080
        }
      }
    },
    {
      "name": "Config resource 'class path resource [application.yaml]' via location 'optional:classpath:/'",
      "properties": {
        "server.port": {
          "value": 8080,
          "origin": "class path resource [application.yaml] - 2:9"
        },
        "spring.datasource.url": {
          "value": "jdbc:mysql://testDbHost:3306/kirito",
          "origin": "class path resource [application.yaml] - 5:44"
        },
        "spring.datasource.username": {
          "value": "kirito",
          "origin": "class path resource [application.yaml] - 6:15"
        },
        "spring.datasource.password": {
          "value": "******",
          "origin": "class path resource [application.yaml] - 7:15"
        },
        "kirito.ak": {
          "value": "kirito@xxx_ak",
          "origin": "class path resource [application.yaml] - 10:7"
        },
        "kirito.sk": {
          "value": "kirito@xxx_sk",
          "origin": "class path resource [application.yaml] - 11:7"
        },
        "management.endpoints.web.exposure.include": {
          "value": "*",
          "origin": "class path resource [application.yaml] - 17:18"
        }
      }
    }
  ]
}
```

可以发现，对于内置的敏感配置信息 `spring.datasource.password`，`Spring Boot Actuator` 是进行了脱敏的，但是对于自定义的一些敏感配置，如 kirito.ak 和 kirito.sk 却被暴露出来了。

可能有的读者会立马提出质疑：我们的机器都部署内网，并且一般都是通过反向代理对外暴露的服务，这类 endpoint 是不会被外部用户访问到的。那我只能说太天真了，例如以下情况都是导致安全漏洞的真实 case：

- 反向代理误配置了根节点，将 actuator 的 endpoint 和 web 服务一起暴露了出去
- 线上配置没问题，测试环境部署时开通了公网 SLB，导致 actuator 的 endpoint 暴露了出去
- 同一环境中某台机器被攻陷，导致应用配置信息泄露

## 安全建议

针对 `Spring Boot Actuator` 提供的 endpoint，采取以下几种措施，可以尽可能降低被安全攻击的风险

1. 最小粒度暴露 endpoint。只开启并暴露真正用到的 endpoint，而不是配置： `management.endpoints.web.exposure.include=*`。
2. 为 endpoint 配置独立的访问端口，从而和 web 服务的端口分离开，避免暴露 web 服务时，误将 actuator 的 endpoint 也暴露出去。例：`management.port=8099`。
3. 引入 `spring-boot-starter-security` 依赖，为 actuator 的 endpoint 配置访问控制。
4. 慎重评估是否需要引入 `spring-boot-stater-actuator`。以我个人的经验，我至今还没有遇到什么需求是一定需要引入`spring-boot-stater-actuator` 才能解决，如果你并不了解上文所述的安全风险，我建议你先去除掉该依赖。

你使用 Spring Boot Actuator 了吗？ 