---
title: Dubbo 基础教程：使用 Nacos 实现服务注册与发现
date: 2021-01-16 17:30:22
tags:
- Dubbo
- Nacos
categories:
- RPC
toc: true
---

## 什么是 Nacos

[Nacos](https://github.com/alibaba/nacos) 致力于帮助您发现、配置和管理微服务。Nacos 提供了一组简单易用的特性集，帮助您快速实现动态服务发现、服务配置、服务元数据及流量管理。Nacos 帮助您更敏捷和容易地构建、交付和管理微服务平台。Nacos 是构建以“服务”为中心的现代应用架构 (例如微服务范式、云原生范式) 的服务基础设施。

在接下里的教程中，将使用 Nacos 作为微服务架构中的注册中心，替代 ZooKeeper 传统方案。

<!-- more -->

## 安装 Nacos

下载地址：https://github.com/alibaba/nacos/releases
本文版本：[1.4.1](https://github.com/alibaba/nacos/releases/tag/1.4.1)

下载完成之后，解压。根据不同平台，执行不同命令，启动单机版 Nacos 服务：

- Linux/Unix/Mac：`sh startup.sh -m standalone`
- Windows：`cmd startup.cmd -m standalone`

> `startup.sh` 脚本位于 Nacos 解压后的 bin 目录下。

启动完成之后，访问：`http://127.0.0.1:8848/nacos/`，使用默认的用户名和密码：`nacos/nacos` 可以进入 Nacos 的服务管理页面。

![Nacos 控制台](https://image.cnkirito.cn/image-20210116152123133.png)

## 构建 Dubbo 应用接入 Nacos 注册中心

在完成了 Nacos 安装和启动之后，下面我们就可以编写两个应用（服务提供者与服务消费者）来验证服务的注册与发现了。

### 定义接口契约

第一步：创建一个 maven 项目，命名为：`dubbo-nacos-api`。

```xml
    <artifactId>dubbo-nacos-api</artifactId>
    <groupId>moe.cnkirito</groupId>
    <version>1.0</version>
```

第二步：定义服务提供者和服务消费者公用的 Java 接口

```java
public interface HelloService {
    String hello(String name);
}
```

Dubbo 的服务提供者和服务消费者一般会共同引用相同的接口，凭借接口达成调用的契约。

### 服务提供者

**第一步**：创建一个 Dubbo 应用，命名为：`dubbo-nacos-provider`。

**第二步**：编辑 `pom.xml`，加入必要的依赖配置：

```xml
		<artifactId>dubbo-nacos-provider</artifactId>
    <groupId>moe.cnkirito</groupId>
    <version>1.0</version>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>2.0.6.RELEASE</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.apache.dubbo</groupId>
            <artifactId>dubbo-spring-boot-starter</artifactId>
            <version>2.7.8</version>
        </dependency>
        <dependency>
            <groupId>com.alibaba.nacos</groupId>
            <artifactId>nacos-client</artifactId>
            <version>1.4.1</version>
        </dependency>
        <dependency>
            <groupId>moe.cnkirito</groupId>
            <artifactId>dubbo-nacos-api</artifactId>
            <version>1.0</version>
        </dependency>
    </dependencies>
```

- `dubbo-spring-boot-starter`：Dubbo 应用可以使用 api 配置、xml 配置、SpringBoot 自动配置，推荐使用 dubbo-spring-boot-starter 提供的自动装配机制构建 Dubbo 应用。
- `nacos-client`：Nacos 提供的 Java 客户端，一般需要显式指定版本，推荐使用和 nacos-server 配套的客户端版本，以确保没有兼容性问题
-  `dubbo-nacos-api`：接口契约

第三步：创建应用并定义服务提供者

```java
@SpringBootApplication
public class DubboProvider {
    public static void main(String[] args) {
        SpringApplication.run(DubboProvider.class, args);
    }
}
```

```java
@DubboService(version = "1.0.0", group = "DUBBO")
public class HelloServiceImpl implements HelloService {

    @Override
    public String hello(String name) {
        return "hello " + name;
    }

}
```

内容非常简单，`@DubboService` 注解是高版本 Dubbo 定义的新注解，用于服务提供者的暴露。一般我们定义 Dubbo 提供者时倾向于明确指定 `version` 和 `group`，而不是留空，Dubbo 会根据 `interfaceName`、`version`、`group` 的三元组唯一确定一个服务。

第四步：配置 Dubbo 服务提供者，定义 `application.yaml`：

```properties
server:
  port: 8080

dubbo:
  scan:
    base-packages: moe.cnkirito.demo
  application:
    name: dubbo-nacos-provider
  protocol:
    name: dubbo
    port: 20880
  registry:
    address: nacos://127.0.0.1:8848
  config-center:
    address: nacos://127.0.0.1:8848
  metadata-report:
    address: nacos://127.0.0.1:8848
```

- `dubbo.scan.base-packages`：配置 @DubboService 等 Dubbo 注解的包扫描路径
- `dubbo.application.name`：Dubbo 的应用名，建议配置，Dubbo 越来越推崇应用级别的服务治理。
- `dubbo.protocol.name` 和 `dubbo.protocol.port`：Dubbo 的协议配置，默认值为 dubbo 和 20880，这里配置出来主要是为了提醒大家，Dubbo 服务提供者会占用掉 `dubbo.protocol.port` 配置的端口号，当一个主机上启动多个服务提供者时，除了需要修改 `server.port` 外还需要修改 `dubbo.protocol.port` 的值 
- `dubbo.registry.address` 、`dubbo.config-center.address` 和 `dubbo.metadata-report.address`：Dubbo 注册中心、配置中心、元数据中心的配置地址，同时指向 Naocs。关于三个中心的介绍可以参考[《Dubbo2.7 三大新特性详解》](https://www.cnkirito.moe/dubbo27-features/)。

第五步：启动应用

启动之后，在日志中观察到如下的日志输出，则代表服务发布成功

```
[DUBBO] Register: dubbo://192.168.0.105:20880/moe.cnkirito.api.HelloService?anyhost=true&application=dubbo-nacos-provider&deprecated=false&dubbo=2.0.2&dynamic=true&generic=false&group=DUBBO&interface=moe.cnkirito.api.HelloService&metadata-type=remote&methods=hello&pid=3885&release=2.7.8&revision=1.0.0&side=provider&timestamp=1610790598864&version=1.0.0, dubbo version: 2.7.8, current host: 192.168.0.105
```

我们可以访问 Nacos 的管理页面 http://127.0.0.1:8848/nacos/ 来查看服务列表，此时可以看到如下内容：

![服务列表](https://image.cnkirito.cn/image-20210116175213815.png)

点击详情，可以查看实例级别的信息

![实例列表](https://image.cnkirito.cn/image-20210116175324746.png)

### 服务消费者

接下来实现一个服务消费者来消费上面的服务

**第一步**：创建一个 Dubbo 应用，命名为：`dubbo-nacos-consumer`

第二步：编辑 pom.xml 中的依赖内容，与上面服务提供者内容一致

**第三步**：创建应用并实现服务消费者

```java
@SpringBootApplication
@RestController
public class DubboConsumer {

    @DubboReference(version = "1.0.0", group = "DUBBO")
    private HelloService helloService;

    public static void main(String[] args) {
        SpringApplication.run(DubboConsumer.class, args);
    }

    @RequestMapping("/hello")
    public String hello(String name) {
        return helloService.hello(name);
    }

}
```

`@DubboReference` 与 `@DubboService` 与成对出现，用于配置服务消费者。需要指定和服务提供者相同的 `version` 和 `group`。

第四步：配置 Dubbo 服务消费者，定义 `application.yaml`：

```yaml
server:
  port: 8081

dubbo:
  scan:
    base-packages: moe.cnkirito.demo
  application:
    name: dubbo-nacos-consumer
  registry:
    address: nacos://127.0.0.1:8848
  config-center:
    address: nacos://127.0.0.1:8848
  metadata-report:
    address: nacos://127.0.0.1:8848
```

和服务提供者配置的差异主要在于这里不用配置 protocol 暴露端口号了，因为消费者不会占用一个端口。但在实际开发中，一个业务应用往往既是服务提供者又是服务消费者，所以往往都需要配置 protocol。

第五步：启动应用发起调用测试

关键日志如下，收到了服务端的地址推送，消费者即可拿着该地址进行调用

```
2021-01-16 18:13:04.714  INFO 4811 --- [ncesChangeEvent] o.a.dubbo.registry.nacos.NacosRegistry   :  [DUBBO] Notify urls for subscribe url consumer://192.168.0.105/moe.cnkirito.api.HelloService?application=dubbo-nacos-consumer&category=providers,configurators,routers&dubbo=2.0.2&group=DUBBO&init=false&interface=moe.cnkirito.api.HelloService&metadata-type=remote&methods=hello&pid=4811&qos.enable=false&release=2.7.8&revision=1.0.0&side=consumer&sticky=false&timestamp=1610791940776&version=1.0.0
```

我们可以访问 Nacos 的管理页面 http://127.0.0.1:8848/nacos/ 来查看服务消费者列表，此时可以看到如下内容：

![消费者列表](https://image.cnkirito.cn/image-20210116182820391.png)

执行调用

```
$curl "localhost:8081/hello?name=kirito"
hello kirito
```

## 常见错误

1. Caused by: java.lang.NoClassDefFoundError: org/apache/commons/lang3/StringUtils

   Dubbo 源码依赖了 common-lang3，如果项目中没有引入过该依赖，需要手动加上该依赖

   ```xml
   <dependency>
       <groupId>org.apache.commons</groupId>
       <artifactId>commons-lang3</artifactId>
       <version>3.9</version>
   </dependency>
   ```



**欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://image.cnkirito.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
