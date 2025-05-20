---
title: 初识 Kong 之负载均衡
date: 2018-04-11 22:56:45
tags:
- Kong
categories:
- 网关
- Kong
toc: true
---

使用 Kong **Community** Edition（社区版 v1.3.0）来搭建一个负载均衡器，由于 Kong 是基于 Openresty 的，而 Openresty 又是 Nginx 的二次封装，所有很多配置项和 Nginx 类似。

来看一个较为典型的 Nginx 负载均衡配置
<!-- more -->
```nginx
upstream hello {
	server localhost:3000 weight=100;
	server localhost:3001 weight=50;
}

server {
	listen	80;
	location /hello {
		proxy_pass http://hello;
	}
}
```

nginx 监听来自本地 80 端口的请求，如果路径与 /hello 匹配，便将请求原封不动的转发到名称为 hello 的 upstream，而该 upstream 我们配置了一个负载均衡器，会路由到本地的 3000 端口和 3001 端口。

```Java
@SpringBootApplication
@RestController
public class KongDemoApplication {

   public static void main(String[] args) {
      System.setProperty("server.port","3000");
      //System.setProperty("server.port","3001");
      SpringApplication.run(KongDemoApplication.class, args);
   }

   @RequestMapping("/hi")
    public String port(){
       return System.getProperty("server.port");
    }

}
```

启动两个 server 分别监听本地 3000 端口和 3001 端口。

如何你的机器已经安装好了 Kong，并对 Kong 的 admin api 有了基础的认识，接下来便可以针对 Kong 进行负载均衡的配置了。

### 配置 upstream 和 target

创建一个名称 hello 的 upstream 

```shell
curl -X POST http://localhost:8001/upstreams --data "name=hello"
```

为 hello 添加两个负载均衡节点

```shell
curl -X POST http://localhost:8001/upstreams/hello/targets --data "target=localhost:3000" --data "weight=100"
```

```shell
curl -X POST http://localhost:8001/upstreams/hello/targets --data "target=localhost:3001" --data "weight=50"
```

如上的配置对应了 Nginx 的配置

```nginx
upstream hello {
	server localhost:3000 weight=100;
	server localhost:3001 weight=50;
}
```

### 配置 service 和 route

使用老版本 Kong 的用户可能会接触过 api 这个概念，但是在 Kong v1.3.0 中，已经被废除了，取而代之的是 service 和 route 的配置。

配置一个 service

```shell
curl -X POST http://localhost:8001/services --data "name=hello" --data "host=hello"
```

host 的值便对应了 upstream 的名称，配置成功后会返回生成的 service 的 id，我的返回结果：8695cc65-16c1-43b1-95a1-5d30d0a50409

为上面的 service 配置路由信息

```shell
curl -X POST http://localhost:8001/routes --data "paths[]=/hello" --data "service.id=8695cc65-16c1-43b1-95a1-5d30d0a50409"
```

请求路径包含 /hello 的请求都会被转移到对应的 service 进行处理。

如上的配置便对应了

```nginx
location /hello {
    proxy_pass http://hello;
}
```

### 测试 Kong 的负载均衡

```Shell
curl http://localhost:8000/hello/hi
```

因为复杂均衡的原因，需要多测试几次，多次 curl 之后结果如下：

```
3000
3000
3000
3000
3000
3000
3001
3001
3001
3000
3001
```

### 参考文档

https://getkong.org/docs/0.13.x/loadbalancing/

https://getkong.org/docs/0.13.x/configuration/

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
