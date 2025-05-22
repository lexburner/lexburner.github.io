---
title: 八幅漫画理解使用 JSON Web Token 设计单点登录系统
date: 2018-04-16 22:57:45
tags:
- JWT
categories:
- JWT
type: 2
toc: true
---

> 转载自：http://blog.leapoahead.com/2015/09/06/understanding-jwt/
>
> 作者：John Wu

### 博主前言

这篇转载的文章和上一篇《JSON Web Token - 在 Web 应用间安全地传递信息》文章均为转载，是我个人在研究 jwt 时浏览下来发现的两篇质量比较高的文章，所以分享给大家。个人对于 jwt 使用场景的理解，包括微信公众号留言中的提问，我都会在下一篇文章中来聊一聊。实际上使用 jwt 设计单点登录系统存在诸多的问题，很多有经验的工程师比较抵制用 jwt 做会话和所谓的单点登录系统，但不妨碍大家作为一个知识点去学习。
<!-- more -->
以下是原文

上次在 [《JSON Web Token - 在 Web 应用间安全地传递信息》](https://www.cnkirito.moe/jwt-learn/) 中我提到了 JSON Web Token 可以用来设计单点登录系统。我尝试用八幅漫画先让大家理解如何设计正常的用户认证系统，然后再延伸到单点登录系统。

如果还没有阅读 [《JSON Web Token - 在 Web 应用间安全地传递信息》](https://www.cnkirito.moe/jwt-learn/)，我强烈建议你花十分钟阅读它，理解 JWT 的生成过程和原理。

### 用户认证八步走

所谓用户认证（Authentication），就是让用户登录，并且在接下来的一段时间内让用户访问网站时可以使用其账户，而不需要再次登录的机制。

> 小知识：可别把用户认证和用户授权（Authorization）搞混了。用户授权指的是规定并允许用户使用自己的权限，例如发布帖子、管理站点等。

首先，服务器应用（下面简称“应用”）让用户通过 Web 表单将自己的用户名和密码发送到服务器的接口。这一过程一般是一个 HTTP POST 请求。建议的方式是通过 SSL 加密的传输（https 协议），从而避免敏感信息被嗅探。

![auth1](https://image.cnkirito.cn/jwtauth1.png)

接下来，应用和数据库核对用户名和密码。

![auth2](https://image.cnkirito.cn/jwtauth2.png)

核对用户名和密码成功后，应用将用户的 `id`（图中的 `user_id`）作为 JWT Payload 的一个属性，将其与头部分别进行 Base64 编码拼接后签名，形成一个 JWT。这里的 JWT 就是一个形同 `lll.zzz.xxx` 的字符串。

![auth3](https://image.cnkirito.cn/jwtauth3.png)

应用将 JWT 字符串作为该请求 Cookie 的一部分返回给用户。注意，在这里必须使用 `HttpOnly` 属性来防止 Cookie 被 JavaScript 读取，从而避免 [跨站脚本攻击（XSS 攻击）](http://www.cnblogs.com/bangerlee/archive/2013/04/06/3002142.html)。

![auth4](https://image.cnkirito.cn/jwtauth4.png)

在 Cookie 失效或者被删除前，用户每次访问应用，应用都会接受到含有 `jwt` 的 Cookie。从而应用就可以将 JWT 从请求中提取出来。

![auth5](https://image.cnkirito.cn/jwtauth5.png)

应用通过一系列任务检查 JWT 的有效性。例如，检查签名是否正确；检查 Token 是否过期；检查 Token 的接收方是否是自己（可选）。

![auth6](https://image.cnkirito.cn/jwtauth6.png)

应用在确认 JWT 有效之后，JWT 进行 Base64 解码（可能在上一步中已经完成），然后在 Payload 中读取用户的 id 值，也就是 `user_id` 属性。这里用户的 `id` 为 1025。

应用从数据库取到 `id` 为 1025 的用户的信息，加载到内存中，进行 ORM 之类的一系列底层逻辑初始化。

![auth7](https://image.cnkirito.cn/jwtauth7.png)

应用根据用户请求进行响应。

![auth8](https://image.cnkirito.cn/jwtauth8.png)

### 和 Session 方式存储 id 的差异

Session 方式存储用户 id 的最大弊病在于要占用大量服务器内存，对于较大型应用而言可能还要保存许多的状态。一般而言，大型应用还需要借助一些 KV 数据库和一系列缓存机制来实现 Session 的存储。

而 JWT 方式将用户状态分散到了客户端中，可以明显减轻服务端的内存压力。除了用户 id 之外，还可以存储其他的和用户相关的信息，例如该用户是否是管理员、用户所在的分桶（见 [《你所应该知道的 A/B 测试基础》一文] 等。

虽说 JWT 方式让服务器有一些计算压力（例如加密、编码和解码），但是这些压力相比磁盘 I/O 而言或许是半斤八两。具体是否采用，需要在不同场景下用数据说话。

### 单点登录

Session 方式来存储用户 id，一开始用户的 Session 只会存储在一台服务器上。对于有多个子域名的站点，每个子域名至少会对应一台不同的服务器，例如：

- www.taobao.com
- nv.taobao.com
- nz.taobao.com
- login.taobao.com

所以如果要实现在 `login.taobao.com` 登录后，在其他的子域名下依然可以取到 Session，这要求我们在多台服务器上同步 Session。

使用 JWT 的方式则没有这个问题的存在，因为用户的状态已经被传送到了客户端。因此，我们只需要将含有 JWT 的 Cookie 的 `domain` 设置为顶级域名即可，例如

```
Set-Cookie: jwt=lll.zzz.xxx; HttpOnly; max-age=980000; domain=.taobao.com
```

注意 `domain` 必须设置为一个点加顶级域名，即 `.taobao.com`。这样，taobao.com 和 *.taobao.com 就都可以接受到这个 Cookie，并获取 JWT 了。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://image.cnkirito.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
