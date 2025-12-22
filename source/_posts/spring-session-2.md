---
title: Re：从零开始的 Spring Session(二)
date: 2017-09-03 20:06:12
tags: 
- Spring Session
- Spring
categories:
- Spring
toc: true
---

上一篇文章介绍了一些 Session 和 Cookie 的基础知识，这篇文章开始正式介绍 Spring Session 是如何对传统的 Session 进行改造的。官网这么介绍 Spring Session：

Spring Session provides an API and implementations for managing a user’s session information. It also provides transparent integration with:

- [HttpSession](https://docs.spring.io/spring-session/docs/1.3.1.RELEASE/reference/html5/#httpsession) - allows replacing the HttpSession in an application container (i.e. Tomcat) neutral way. Additional features include:
  - **Clustered Sessions** - Spring Session makes it trivial to support [clustered sessions](https://docs.spring.io/spring-session/docs/1.3.1.RELEASE/reference/html5/#httpsession-redis) without being tied to an application container specific solution.
  - **Multiple Browser Sessions** - Spring Session supports [managing multiple users' sessions](https://docs.spring.io/spring-session/docs/1.3.1.RELEASE/reference/html5/#httpsession-multi) in a single browser instance (i.e. multiple authenticated accounts similar to Google).
  - **RESTful APIs** - Spring Session allows providing session ids in headers to work with [RESTful APIs](https://docs.spring.io/spring-session/docs/1.3.1.RELEASE/reference/html5/#httpsession-rest)
- [WebSocket](https://docs.spring.io/spring-session/docs/1.3.1.RELEASE/reference/html5/#websocket) - provides the ability to keep the `HttpSession` alive when receiving WebSocket messages

其具体的特性非常之多，具体的内容可以从文档中了解到，笔者做一点自己的总结，Spring Session 的特性包括但不限于以下：

- 使用 GemFire 来构建 C/S 架构的 httpSession（不关注）
- 使用第三方仓储来实现集群 session 管理，也就是常说的分布式 session 容器，替换应用容器（如 tomcat 的 session 容器）。仓储的实现，Spring Session 提供了三个实现（redis，mongodb，jdbc），其中 redis 使我们最常用的。程序的实现，使用 AOP 技术，几乎可以做到透明化地替换。（核心）
- 可以非常方便的扩展 Cookie 和自定义 Session 相关的 Listener，Filter。
- 可以很方便的与 Spring Security 集成，增加诸如 findSessionsByUserName，rememberMe，限制同一个账号可以同时在线的 Session 数（如设置成 1，即可达到把前一次登录顶掉的效果）等等

介绍完特性，下面开始一步步集成 Spring Session

<!-- more -->

## 使用 Redis 集成 Spring Session 

- 引入依赖，Spring Boot 的版本采用 1.5.4

  ```xml
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
  </dependency>
  <dependency>
      <groupId>org.springframework.session</groupId>
      <artifactId>spring-session-data-redis</artifactId>
  </dependency>
  ```

- 配置

  配置类开启 Redis Http Session

  ```java
  @Configuration
  @EnableRedisHttpSession
  public class HttpSessionConfig {

  }
  ```

  基本是 0 配置，只需要让主配置扫描到 @EnableRedisHttpSession 即可

  配置文件 application.yml，配置连接的 redis 信息

  ```yaml
  spring:
    redis:
      host: localhost
      port: 6379
      database: 0
  ```

- 编写测试 Controller，以便于观察 Spring Session 的特性，和前一篇文章使用同样的代码

  ```java
  @Controller
  public class CookieController {

      @RequestMapping("/test/cookie")
      public String cookie(@RequestParam("browser") String browser, HttpServletRequest request, HttpSession session) {
          // 取出 session 中的 browser
          Object sessionBrowser = session.getAttribute("browser");
          if (sessionBrowser == null) {
              System.out.println("不存在 session，设置 browser=" + browser);
              session.setAttribute("browser", browser);
          } else {
              System.out.println("存在 session，browser=" + sessionBrowser.toString());
          }
          Cookie[] cookies = request.getCookies();
          if (cookies != null && cookies.length > 0) {
              for (Cookie cookie : cookies) {
                  System.out.println(cookie.getName() + ":" + cookie.getValue());
              }
          }
          return "index";
      }
  }
  ```

启动类省略，下面开始测试。

在浏览器中访问如下端点：`http://localhost:8080/test/cookie?browser=chrome`，下面是连续访问 4 次的结果

```
1	不存在 session，设置 browser=chrome
2	存在 session，browser=chrome
	SESSION : 70791b17-83e1-42db-8894-73fbd2f2a159
3	存在 session，browser=chrome
	SESSION : 70791b17-83e1-42db-8894-73fbd2f2a159
4	存在 session，browser=chrome
	SESSION : 70791b17-83e1-42db-8894-73fbd2f2a159
```

如果还记得上一篇文章中运行结果的话，会发现和原生的 session 管理是有一些差别，原先的信息中我们记得 Cookie 中记录的 Key 值是 JSESSIONID，而替换成 RedisHttpSession 之后变成了 SESSION。接着观察 redis 中的变化：

![redis 中的 session](https://image.cnkirito.cn/image/redisSession.png)

解析一下这个 redis store，如果不纠结于细节，可以跳过，不影响使用。

​1 spring:session 是默认的 Redis HttpSession 前缀（redis 中，我们常用 ':' 作为分割符）。

2 每一个 session 都会有三个相关的 key，第三个 key 最为重要，它是一个 HASH 数据结构，将内存中的 session 信息序列化到了 redis 中。如上文的 browser，就被记录为 sessionAttr:browser=chrome, 还有一些 meta 信息，如创建时间，最后访问时间等。

3 另外两个 key，expirations:1504446540000 和 sessions:expires:7079... 我发现大多数的文章都没有对其分析，前者是一个 SET 类型，后者是一个 STRING 类型，可能会有读者发出这样的疑问，redis 自身就有过期时间的设置方式 TTL，为什么要额外添加两个 key 来维持 session 过期的特性呢？这需要对 redis 有一定深入的了解才能想到这层设计。当然这不是本节的重点，简单提一下：redis 清除过期 key 的行为是一个异步行为且是一个低优先级的行为，用文档中的原话来说便是，可能会导致 session 不被清除。于是引入了专门的 expiresKey，来专门负责 session 的清除，包括我们自己在使用 redis 时也需要关注这一点。在开发层面，我们仅仅需要关注第三个 key 就行了。

## 总结

本节主要讲解了 Spring Boot 如何集成 Spring Session，下一节将介绍更加复杂的特性。包括自定义 Cookie 序列化策略，与 Spring Security 的集成，根据用户名查找 session 等特性以及使用注意点。


** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://image.cnkirito.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)




