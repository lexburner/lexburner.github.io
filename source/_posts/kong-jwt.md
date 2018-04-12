---
title: Kong 集成 Jwt 插件
date: 2018-04-11 22:57:45
tags:
- Kong
- 网关
categories:
- Kong
---

上一篇文章使用 Kong 完成了负载均衡的配置，本文介绍下在此基础上如何集成 jwt 插件来保护内部服务的安全。前置知识点：Jwt 基础概念。推荐阅读：

通俗易懂地介绍 Jwt https://blog.leapoahead.com/2015/09/06/understanding-jwt/

Jwt 的官网 https://jwt.io/

### 为 Kong 安装 Jwt 插件

Kong 官方提供了 Jwt 插件，可以对 某个 service 或者 route 添加 Jwt 认证，我以 service 为例介绍 Jwt 插件的使用

为 hello（上篇文章创建的 service）添加 Jwt 插件

```shell
curl -X POST http://localhost:8001/services/hello/plugins --data "name=jwt"
```

接着尝试访问这个受保护的服务

```shell
kirito$ curl http://localhost:8000/hello/hi
=> {"message":"Unauthorized"}
```

说明该 service 已经被 Jwt 保护起来了。

### 在 Kong 中创建用户

```shell
curl -X POST http://localhost:8001/consumers --data "username=kirito"
```

使用了新的端点 consumers 创建了一个名称为 kirito 的用户。

### 查看用户信息

```shell
curl http://127.0.0.1:8001/consumers/kirito/jwt
```

响应如下：

```json
{
    "total": 1,
    "data": [
        {
            "created_at": 1523432449000,
            "id": "cb01a6cf-7371-4f23-8193-fa69a0bb070c",
            "algorithm": "HS256",
            "key": "vcnvYSFzTIGyMxzKSgnNU0uvxixdYWB9",
            "secret": "qQ9tSqIYjilnJmKuZXvJpgNo4ZqJDrim",
            "consumer_id": "7d34e6bc-89ea-4f33-9346-9c10600e4afd"
        }
    ]
}
```

重点关注三个值 algorithm，key，secret，他们和 Jwt 算法的参数密切相关

### 生成 Jwt 

使用 jwt 官网(jwt.io)提供的 Debugger 功能可以很方便的生成 jwt。

![jwt官网](http://ov0zuistv.bkt.clouddn.com/9ADA76C8-6704-4C6A-A7D5-E6EF91D5225D.png)

HEADER 部分声明了验证方式为 JWT，加密算法为 HS256

PAYLOAD 部分原本有 5 个参数

```json
{
    "iss": "kirito",
    "iat": 1441593502,
    "exp": 1441594722,
    "aud": "cnkirito.moe",
    "sub": "250577914@qq.com",
}
```

这里面的前五个字段都是由 JWT 的标准（[RFC7519](https://tools.ietf.org/html/rfc7519)）所定义的。

- `iss`: 该 JWT 的签发者
- `sub`: 该 JWT 所面向的用户
- `aud`: 接收该 JWT 的一方
- `exp`(expires): 什么时候过期，这里是一个 Unix 时间戳
- `iat`(issued at): 在什么时候签发的

iss 这一参数在 Kong 的 Jwt 插件中对应的是

`curl http://127.0.0.1:8001/consumers/kirito/jwt` 获取的用户信息中的 key 值。

而其他值都可以不填写

最后还要一个没有用到的用户信息：secret。HS256 加密算法是对称加密算法，加密和解密都依赖于同一个密钥，在生成 Jwt 的消息签名时（Verify Signature）需要被使用到。

我们使用 jwt 官网(jwt.io)提供的 Debugger 功能快速生成我们的 Jwt

```
eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ2Y252WVNGelRJR3lNeHpLU2duTlUwdXZ4aXhkWVdCOSJ9.3iL4sXgZyvRx2XtIe2X73yplfmSSu1WPGcvyhwq7TVE
```

由三个圆点分隔的长串便是用户身份的标识了

### 携带 Jwt 访问受限资源

```shell
kirito$ curl http://localhost:8000/hello/hi
=> {"message":"Unauthorized"}
```

在此之前直接访问 hello 服务是处于未验证状态

携带 Jwt 访问

```shell
curl http://localhost:8000/hello/hi -H 'Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ2Y252WVNGelRJR3lNeHpLU2duTlUwdXZ4aXhkWVdCOSJ9.3iL4sXgZyvRx2XtIe2X73yplfmSSu1WPGcvyhwq7TVE'
=> 3000
```

成功获取到了服务端的响应，Jwt 插件就这样正常工作了。

### 补充

1. 可以指定生成的 key（对应 Jwt 中的 iss），和 secret

```shell
curl -X POST http://localhost:8001/consumers/kirito/jwt --data "secret=YmxvYiBkYXRh" --data "key=kirito"
```

如果想要修改 secret 和 key，经过目前笔者的尝试后，似乎只能够先删除，后新增。

2. Jwt 也可以作为 QueryString 参数携带在 get 请求中

```shell
curl http://localhost:8000/hello/hi?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJ2Y252WVNGelRJR3lNeHpLU2duTlUwdXZ4aXhkWVdCOSJ9.3iL4sXgZyvRx2XtIe2X73yplfmSSu1WPGcvyhwq7TVE
```

3. 通常用户需要自己写一个服务去帮助 Consumer 生成自己的 Jwt，自然不能总是依赖于 Jwt 官方的 Debugger，当然也没必要重复造轮子（尽管这并不难），可以考虑使用开源实现，比如 Java 中推荐使用 jjwt(https://github.com/jwtk/jjwt)

```Java
String jwt = Jwts.builder()
        .setHeaderParam("typ","jwt")
        .setHeaderParam("alg","HS256")
        .setIssuer("kirito")
        .signWith(SignatureAlgorithm.HS256, Base64.getEncoder().encodeToString("YmxvYiBkYXRh".getBytes(Charset.forName("utf-8"))))
        .compact();
```

