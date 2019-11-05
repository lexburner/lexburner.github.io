---
title: JSON Web Token - 在 Web 应用间安全地传递信息
date: 2018-04-14 22:57:45
tags:
- JWT
categories:
- JWT
type: 2
---

> 转载自：http://blog.leapoahead.com/2015/09/06/understanding-jwt/
>
> 作者：John Wu

JSON Web Token（JWT）是一个非常轻巧的 [规范](https://tools.ietf.org/html/draft-ietf-oauth-json-web-token-32)。这个规范允许我们使用 JWT 在用户和服务器之间传递安全可靠的信息。

让我们来假想一下一个场景。在 A 用户关注了 B 用户的时候，系统发邮件给 B 用户，并且附有一个链接“点此关注 A 用户”。链接的地址可以是这样的
<!-- more -->
```
https://your.awesome-app.com/make-friend/?from_user=B&target_user=A
```

上面的 URL 主要通过 URL 来描述这个当然这样做有一个弊端，那就是要求用户 B 用户是一定要先登录的。可不可以简化这个流程，让 B 用户不用登录就可以完成这个操作。JWT 就允许我们做到这点。

![jwt](https://kirito.iocoder.cn/jwt.png)

### JWT 的组成

一个 JWT 实际上就是一个字符串，它由三部分组成，** 头部 **、** 载荷 ** 与 ** 签名 **。

##### 载荷（Payload）

我们先将上面的添加好友的操作描述成一个 JSON 对象。其中添加了一些其他的信息，帮助今后收到这个 JWT 的服务器理解这个 JWT。

```
{
    "iss": "John Wu JWT",
    "iat": 1441593502,
    "exp": 1441594722,
    "aud": "www.example.com",
    "sub": "jrocket@example.com",
    "from_user": "B",
    "target_user": "A"
}
```

这里面的前五个字段都是由 JWT 的标准所定义的。

- `iss`: 该 JWT 的签发者
- `sub`: 该 JWT 所面向的用户
- `aud`: 接收该 JWT 的一方
- `exp`(expires): 什么时候过期，这里是一个 Unix 时间戳
- `iat`(issued at): 在什么时候签发的

这些定义都可以在 [标准](https://tools.ietf.org/html/draft-ietf-oauth-json-web-token-32) 中找到。

将上面的 JSON 对象进行 [base64 编码] 可以得到下面的字符串。这个字符串我们将它称作 JWT 的 **Payload**（载荷）。

```
eyJpc3MiOiJKb2huIFd1IEpXVCIsImlhdCI6MTQ0MTU5MzUwMiwiZXhwIjoxNDQxNTk0NzIyLCJhdWQiOiJ3d3cuZXhhbXBsZS5jb20iLCJzdWIiOiJqcm9ja2V0QGV4YW1wbGUuY29tIiwiZnJvbV91c2VyIjoiQiIsInRhcmdldF91c2VyIjoiQSJ9
```

如果你使用 Node.js，可以用 Node.js 的包 [base64url](https://github.com/brianloveswords/base64url) 来得到这个字符串。

```
var base64url = require('base64url')
var header = {
    "from_user": "B",
    "target_user": "A"
}
console.log(base64url(JSON.stringify(header)))
// 输出：eyJpc3MiOiJKb2huIFd1IEpXVCIsImlhdCI6MTQ0MTU5MzUwMiwiZXhwIjoxNDQxNTk0NzIyLCJhdWQiOiJ3d3cuZXhhbXBsZS5jb20iLCJzdWIiOiJqcm9ja2V0QGV4YW1wbGUuY29tIiwiZnJvbV91c2VyIjoiQiIsInRhcmdldF91c2VyIjoiQSJ9
```

> 小知识：Base64 是一种编码，也就是说，它是可以被翻译回原来的样子来的。它并不是一种加密过程。

##### 头部（Header）

JWT 还需要一个头部，头部用于描述关于该 JWT 的最基本的信息，例如其类型以及签名所用的算法等。这也可以被表示成一个 JSON 对象。

```
{
  "typ": "JWT",
  "alg": "HS256"
}
```

在这里，我们说明了这是一个 JWT，并且我们所用的签名算法（后面会提到）是 HS256 算法。

对它也要进行 Base64 编码，之后的字符串就成了 JWT 的 **Header**（头部）。

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9
```

##### 签名（签名）

将上面的两个编码后的字符串都用句号 `.` 连接在一起（头部在前），就形成了

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJmcm9tX3VzZXIiOiJCIiwidGFyZ2V0X3VzZXIiOiJBIn0
```

> 这一部分的过程在 [node-jws 的源码](https://github.com/brianloveswords/node-jws/blob/master/lib/sign-stream.js) 中有体现

最后，我们将上面拼接完的字符串用 HS256 算法进行加密。在加密的时候，我们还需要提供一个密钥（secret）。如果我们用 `mystar` 作为密钥的话，那么就可以得到我们加密后的内容

```
rSWamyAYwuHCo7IFAgd1oRpSP7nzL7BF5t7ItqpKViM
```

这一部分又叫做 ** 签名 **。

![sig1](https://kirito.iocoder.cn/sig1.png)

最后将这一部分签名也拼接在被签名的字符串后面，我们就得到了完整的 JWT

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJmcm9tX3VzZXIiOiJCIiwidGFyZ2V0X3VzZXIiOiJBIn0.rSWamyAYwuHCo7IFAgd1oRpSP7nzL7BF5t7ItqpKViM
```

于是，我们就可以将邮件中的 URL 改成

```
https://your.awesome-app.com/make-friend/?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJmcm9tX3VzZXIiOiJCIiwidGFyZ2V0X3VzZXIiOiJBIn0.rSWamyAYwuHCo7IFAgd1oRpSP7nzL7BF5t7ItqpKViM
```

这样就可以安全地完成添加好友的操作了！

且慢，我们一定会有一些问题：

1. 签名的目的是什么？
2. Base64 是一种编码，是可逆的，那么我的信息不就被暴露了吗？

让我逐一为你说明。

### 签名的目的

最后一步签名的过程，实际上是对头部以及载荷内容进行签名。一般而言，加密算法对于不同的输入产生的输出总是不一样的。对于两个不同的输入，产生同样的输出的概率极其地小（有可能比我成世界首富的概率还小）。所以，我们就把“不一样的输入产生不一样的输出”当做必然事件来看待吧。

所以，如果有人对头部以及载荷的内容解码之后进行修改，再进行编码的话，那么新的头部和载荷的签名和之前的签名就将是不一样的。而且，如果不知道服务器加密的时候用的密钥的话，得出来的签名也一定会是不一样的。

![sig2](https://kirito.iocoder.cn/sig2.png)

服务器应用在接受到 JWT 后，会首先对头部和载荷的内容用同一算法再次签名。那么服务器应用是怎么知道我们用的是哪一种算法呢？别忘了，我们在 JWT 的头部中已经用 `alg` 字段指明了我们的加密算法了。

如果服务器应用对头部和载荷再次以同样方法签名之后发现，自己计算出来的签名和接受到的签名不一样，那么就说明这个 Token 的内容被别人动过的，我们应该拒绝这个 Token，返回一个 HTTP 401 Unauthorized 响应。

### 信息会暴露？

是的。

所以，在 JWT 中，不应该在载荷里面加入任何敏感的数据。在上面的例子中，我们传输的是用户的 User ID。这个值实际上不是什么敏感内容，一般情况下被知道也是安全的。

但是像密码这样的内容就不能被放在 JWT 中了。如果将用户的密码放在了 JWT 中，那么怀有恶意的第三方通过 Base64 解码就能很快地知道你的密码了。

### JWT 的适用场景

我们可以看到，JWT 适合用于向 Web 应用传递一些非敏感信息。例如在上面提到的完成加好友的操作，还有诸如下订单的操作等等。

其实 JWT 还经常用于设计用户认证和授权系统，甚至实现 Web 应用的单点登录。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
