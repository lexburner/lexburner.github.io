---
title: 浅析分布式下的事件驱动机制（PubSub 模式）
date: 2017-09-13 22:49:23
tags:
- 架构设计
- Spring
categories:
- Spring
---

上一篇文章《浅析 Spring 中的事件驱动机制》简单介绍了 Spring 对事件的支持。Event 的整个生命周期，从 publisher 发出，经过 applicationContext 容器通知到 EventListener，都是发生在单个 Spring 容器中，而在分布式场景下，有些时候一个事件的产生，可能需要被多个实例响应，本文主要介绍分布式场景下的事件驱动机制，由于使用了 Redis，ActiveMQ，也可以换一个名词来理解：分布式下的发布订阅模式。

## JMS 规范

在日常项目开发中，我们或多或少的发现一些包一些类位于 java 或 javax 中，他们主要提供抽象类，接口，提供了一种规范，如 JPA，JSR，JNDI，JTA，JMS，他们是由 java 指定的标准规范，一流企业做标准、二流企业做品牌、三流企业做产品，虽然有点调侃的意味，但也可以见得它的重要意义。而 JMS 就是 java 在消息服务上指定的标准

> The Java Message Service (JMS) API is a messaging standard that allows application components based on the Java Platform Enterprise Edition (Java EE) to create, send, receive, and read messages. It enables distributed communication that is loosely coupled, reliable, and asynchronous.
>
> JMS（JAVA Message Service,java 消息服务）API 是一个消息服务的标准或者说是规范，允许应用程序组件基于 JavaEE 平台创建、发送、接收和读取消息。它使分布式通信耦合度更低，消息服务更加可靠以及异步性。

消息中间件有非常多的实现，如 ActiveMQ，RabbitMQ，RocketMQ，而他们同一遵循的接口规范，便是 JMS。在下文中即将出现的 ConnectionFactory，Destination，Connection，Session，MessageListener，Topic，Queue 等等名词，都是 JMS 核心的接口，由于本文的初衷并不是讲解 MQ&JMS，所以这些机制暂且跳过。

## 定义分布式事件需求

在上一个项目中，我们对接了外网的 http 接口，而安全性的保障则是交给 OAuth2 来完成，作为 OAuth2 的客户端，我们需要获取服务端返回的 token，而 token 接口的获取次数每个月是有限制的，于是我们选择使用 Redis 来保存，定时刷新。由于每次发起请求时都要携带 token，为了更高的性能减少一次 redis io，我们在 TokenService 中使用了本地变量缓存 token。于是形成如下的 token 获取机制：

![token 获取流程](http://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720170913232959.png)

这个图并不复杂，只是为了方便描述需求：首先去本地变量中加载 token，若 token==null，则去 Redis 加载，若 Redis 未命中（token 过期了），则最终调用外部的 http 接口获取实时的 token，同时存入 redis 中和本地变量中。

这个需求设计到这样一个问题：大多数情况下是单个实例中发现 redis 中的 token 为空，而它需要同时获取最新 token，并通知其他的实例也去加载最新的 token，这个时候事件广播就可以派上用场了。

由于 token 缓存在了 Redis 中，我们首先介绍 Redis 的发布订阅机制。

<!-- more -->

## Redis 中的 Pub 与 Sub

redis 不仅仅具备缓存的功能，它还拥有一个 channel 机制，我们可以使用 Redis 来进行发布订阅。上述的 token 流程我们简化一下，省略保存到 redis 的那一环，直接介绍如何通知其他应用刷新 token。

## 引入依赖和配置

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```yaml
spring:
  redis:
    database: 0
    host: localhost
    port: 6379
```

### 定义 TokenService

```java
@Service
public class TokenService {

    @Autowired
    StringRedisTemplate redisTemplate;

    public void getToken(String username) { // <1>
        String token = UUID.randomUUID().toString();
        // 模拟 http 接口使用用户名和密码获取 token
        System.out.println(username + "成功获取 token ..." + token);
        // 发送 token 刷新广播
        System.out.println("广播 token 刷新事件 ...");
        redisTemplate.convertAndSend(RedisPubSubConfig.tokenChannel, token);
    }


    public void refreshTokenListener(String token) { // <2>
        System.out.println("接到 token 刷新事件，刷新 token :" + token);
    }
}
```

<1> 模拟获取 token 的方法，获取 token 的同时发送广播。

<2> 用于接收其他应用发送过来的广播消息。

### 配置 RedisMessageListenerContainer

在 Spring 应用中 Event 是由 Spring 容器管理的，而在 Redis 的消息机制中，Event 是由 RedisMessageListenerContainer 管理的。我们为 token 配置一个 channel，用于刷新 token：

```java
@Configuration
public class RedisPubSubConfig {

    public final static String tokenChannel = "tokenChannel";

    @Bean
    RedisMessageListenerContainer redisMessageListenerContainer(RedisConnectionFactory redisConnectionFactory) {
        RedisMessageListenerContainer redisMessageListenerContainer = new RedisMessageListenerContainer();// <1>
        redisMessageListenerContainer.setConnectionFactory(redisConnectionFactory);
        redisMessageListenerContainer.addMessageListener(tokenRefreshListener(), new ChannelTopic(tokenChannel)); // <2>
        return redisMessageListenerContainer;
    }

    @Autowired
    TokenService tokenService;

    MessageListener tokenRefreshListener() {
        return new MessageListener() {
            @Override
            public void onMessage(Message message, byte[] pattern) {
                byte[] bytes = message.getBody(); // <3>
                tokenService.refreshTokenListener(new String(bytes));
            }
        };
    }

}
```

<1> RedisMessageListenerContainer 用于管理所有的 redis 相关的发布与订阅

<2> 为 Redis 容器注册特定的订阅者，在本例中使用 tokenRefreshListener 监听 tokenChannel 频道，当收到消息通知时，会自动调用 onMessage 方法。

<3> 使用 message.getBody() 可以获取消息的具体内容，在本例中即 token

## 测试结果

同样的这个应用，我们在 8080,8081,8082 启动三个，在 8080 中，我们调用 tokenService.getToken("kirito");(注意必须要连接到 redis 的同一个 database)

在三个控制台中我们得到了如下的结果：

8080：

```
kirito 成功获取 token ...5d4d2a48-934f-450d-8806-e6095b172286
广播 token 刷新事件 ...
接到 token 刷新事件，刷新 token : 5d4d2a48-934f-450d-8806-e6095b172286
```

8081：

```
接到 token 刷新事件，刷新 token : 5d4d2a48-934f-450d-8806-e6095b172286
```

8082：

```
接到 token 刷新事件，刷新 token : 5d4d2a48-934f-450d-8806-e6095b172286
```

可以发现其他系统的确收到了通知。

## ActiveMQ 中的 Pub 与 Sub

Redis 中的发布订阅其实在真正的企业开发中并不是很常用，如果涉及到一致性要求较高的需求，专业的消息中间件可以更好地为我们提供服务。下面介绍一下 ActiveMQ 如何实现发布订阅。

ActiveMQ 为我们提供很好的监控页面，延时队列，消息 ACK，事务，持久化等等机制，且拥有较高的吞吐量，是企业架构中不可或缺的一个重要中间件。

### 引入依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-activemq</artifactId>
</dependency>
```

```yaml
spring:
  activemq:
    in-memory: false # <1>
    broker-url: tcp://127.0.0.1:61616
    user: admin
    password: admin
  jms:
    pub-sub-domain: true # <2>
```

<1> springboot 的自动配置会帮我们启动一个内存中的消息队列，引入 spring-boot-starter-activemq 倚赖时需要特别注意这一点，本例连接本机的 ActiveMQ。

<2> springboot 默认不支持 PubSub 模式，需要手动开启。

## 定义 TokenService

```java
@Service
public class TokenService {

    @Autowired
    JmsTemplate jmsTemplate; // <1>

    @Autowired
    Topic tokenTopic; // <3>

    public void getToken(String username) {
        String token = UUID.randomUUID().toString();
        // 模拟 http 接口使用用户名和密码获取 token
        System.out.println(username + "成功获取 token ..." + token);
        // 发送 token 刷新广播
        System.out.println("广播 token 刷新事件 ...");
        try {
            Message message = new ActiveMQMessage();
            message.setStringProperty("token", token);
            jmsTemplate.convertAndSend(tokenTopic, message);// <1>
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @JmsListener(destination = ActivemqPubSubConfig.tokenTopic) // <2>
    public void refreshTokenListener(Message message) throws Exception {
        System.out.println("接到 token 刷新事件，刷新 token :" + message.getStringProperty("token"));
    }

}
```

<1> 使用模板设计模式的好处体现了出来，再前面的 RedisTemplate 中我们也是使用同样的 template.convertAndSend() 发送消息

<2> JmsListener 对应于 EventListener，接收来自 ActiveMQ 中 tokenTopic 的消息通知

<3> tokenTopic 定义在下面的 config 中

### 配置 ActiveMQ 的 topic

```java
@Configuration
public class ActivemqPubSubConfig {

    public final static String tokenTopic = "tokenTopic";

    @Bean
    Topic tokenTopic(){
        return new ActiveMQTopic(ActivemqPubSubConfig.tokenTopic);
    }


}
```

非常简单的配置，因为 ActiveMQAutoConfiguration 已经帮我们做了相当多的配置，我们只需要顶一个 topic 即可使用 ActiveMQ 的功能。

### 查看 ActiveMQ 的监控端

省略了发送消息的过程，实际上可以得到和 Redis PubSub 一样的效果。来看一下 ActiveMQ 自带的监控端，在发送消息后，发生了什么变化，访问本地端口 `http://localhost:8161/admin` ，可以看到消息被消费了。

![ActiveMQ 监控端](http://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720170914001552.png)

## 总结

本文介绍了 Redis，ActiveMQ 的 PubSub 特性，这是我理解的分布式场景下的事件驱动的使用。事件驱动是一种思想，PubSub 是一种模式，Redis，ActiveMQ 是一种应用，落到实处，便可以是本文介绍的 token 这个小小的业务实现。但是注意，使用 Redis，ActiveMQ 理解事件驱动可以，但是不能等同事件驱动，事件驱动还有很多其他场景下体现，笔者功力不够，无法一一介绍，怕人误解，特此强调一下。

