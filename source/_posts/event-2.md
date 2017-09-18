---
title: 浅析分布式下的事件驱动机制（PubSub模式）
date: 2017-09-13 22:49:23
tags:
- 架构设计
- Spring
categories:
- Spring
---

上一篇文章《浅析Spring中的事件驱动机制》简单介绍了Spring对事件的支持。Event的整个生命周期，从publisher发出，经过applicationContext容器通知到EventListener，都是发生在单个Spring容器中，而在分布式场景下，有些时候一个事件的产生，可能需要被多个实例响应，本文主要介绍分布式场景下的事件驱动机制，由于使用了Redis，ActiveMQ，也可以换一个名词来理解：分布式下的发布订阅模式。

## JMS规范

在日常项目开发中，我们或多或少的发现一些包一些类位于java或javax中，他们主要提供抽象类，接口，提供了一种规范，如JPA，JSR，JNDI，JTA，JMS，他们是由java指定的标准规范，一流企业做标准、二流企业做品牌、三流企业做产品，虽然有点调侃的意味，但也可以见得它的重要意义。而JMS就是java在消息服务上指定的标准

> The Java Message Service (JMS) API is a messaging standard that allows application components based on the Java Platform Enterprise Edition (Java EE) to create, send, receive, and read messages. It enables distributed communication that is loosely coupled, reliable, and asynchronous.
>
> JMS（JAVA Message Service,java消息服务）API是一个消息服务的标准或者说是规范，允许应用程序组件基于JavaEE平台创建、发送、接收和读取消息。它使分布式通信耦合度更低，消息服务更加可靠以及异步性。

消息中间件有非常多的实现，如ActiveMQ，RabbitMQ，RocketMQ，而他们同一遵循的接口规范，便是JMS。在下文中即将出现的ConnectionFactory，Destination，Connection，Session，MessageListener，Topic，Queue等等名词，都是JMS核心的接口，由于本文的初衷并不是讲解MQ&JMS，所以这些机制暂且跳过。

## 定义分布式事件需求

在上一个项目中，我们对接了外网的http接口，而安全性的保障则是交给OAuth2来完成，作为OAuth2的客户端，我们需要获取服务端返回的token，而token接口的获取次数每个月是有限制的，于是我们选择使用Redis来保存，定时刷新。由于每次发起请求时都要携带token，为了更高的性能减少一次redis io，我们在TokenService中使用了本地变量缓存token。于是形成如下的token获取机制：

![token获取流程](http://ov0zuistv.bkt.clouddn.com/QQ%E5%9B%BE%E7%89%8720170913232959.png)

这个图并不复杂，只是为了方便描述需求：首先去本地变量中加载token，若token==null，则去Redis加载，若Redis未命中（token过期了），则最终调用外部的http接口获取实时的token，同时存入redis中和本地变量中。

这个需求设计到这样一个问题：大多数情况下是单个实例中发现redis中的token为空，而它需要同时获取最新token，并通知其他的实例也去加载最新的token，这个时候事件广播就可以派上用场了。

由于token缓存在了Redis中，我们首先介绍Redis的发布订阅机制。

<!-- more -->

## Redis中的Pub与Sub

redis不仅仅具备缓存的功能，它还拥有一个channel机制，我们可以使用Redis来进行发布订阅。上述的token流程我们简化一下，省略保存到redis的那一环，直接介绍如何通知其他应用刷新token。

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

### 定义TokenService

```java
@Service
public class TokenService {

    @Autowired
    StringRedisTemplate redisTemplate;

    public void getToken(String username) { // <1>
        String token = UUID.randomUUID().toString();
        //模拟http接口使用用户名和密码获取token
        System.out.println(username + " 成功获取token ..." + token);
        //发送token刷新广播
        System.out.println("广播token刷新事件 ...");
        redisTemplate.convertAndSend(RedisPubSubConfig.tokenChannel, token);
    }


    public void refreshTokenListener(String token) { // <2>
        System.out.println("接到token刷新事件，刷新 token : " + token);
    }
}
```

<1> 模拟获取token的方法，获取token的同时发送广播。

<2> 用于接收其他应用发送过来的广播消息。

### 配置RedisMessageListenerContainer

在Spring应用中Event是由Spring容器管理的，而在Redis的消息机制中，Event是由RedisMessageListenerContainer管理的。我们为token配置一个channel，用于刷新token：

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

<1> RedisMessageListenerContainer用于管理所有的redis相关的发布与订阅

<2> 为Redis容器注册特定的订阅者，在本例中使用tokenRefreshListener监听tokenChannel频道，当收到消息通知时，会自动调用onMessage方法。

<3> 使用message.getBody()可以获取消息的具体内容，在本例中即token

## 测试结果

同样的这个应用，我们在8080,8081,8082启动三个，在8080中，我们调用tokenService.getToken("kirito");(注意必须要连接到redis的同一个database)

在三个控制台中我们得到了如下的结果：

8080：

```
kirito 成功获取token ...5d4d2a48-934f-450d-8806-e6095b172286
广播token刷新事件 ...
接到token刷新事件，刷新 token : 5d4d2a48-934f-450d-8806-e6095b172286
```

8081：

```
接到token刷新事件，刷新 token : 5d4d2a48-934f-450d-8806-e6095b172286
```

8082：

```
接到token刷新事件，刷新 token : 5d4d2a48-934f-450d-8806-e6095b172286
```

可以发现其他系统的确收到了通知。

## ActiveMQ中的Pub与Sub

Redis中的发布订阅其实在真正的企业开发中并不是很常用，如果涉及到一致性要求较高的需求，专业的消息中间件可以更好地为我们提供服务。下面介绍一下ActiveMQ如何实现发布订阅。

ActiveMQ为我们提供很好的监控页面，延时队列，消息ACK，事务，持久化等等机制，且拥有较高的吞吐量，是企业架构中不可或缺的一个重要中间件。

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

<1> springboot的自动配置会帮我们启动一个内存中的消息队列，引入spring-boot-starter-activemq倚赖时需要特别注意这一点，本例连接本机的ActiveMQ。

<2> springboot默认不支持PubSub模式，需要手动开启。

## 定义TokenService

```java
@Service
public class TokenService {

    @Autowired
    JmsTemplate jmsTemplate; // <1>

    @Autowired
    Topic tokenTopic; // <3>

    public void getToken(String username) {
        String token = UUID.randomUUID().toString();
        //模拟http接口使用用户名和密码获取token
        System.out.println(username + " 成功获取token ..." + token);
        //发送token刷新广播
        System.out.println("广播token刷新事件 ...");
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
        System.out.println("接到token刷新事件，刷新 token : " + message.getStringProperty("token"));
    }

}
```

<1> 使用模板设计模式的好处体现了出来，再前面的RedisTemplate中我们也是使用同样的template.convertAndSend()发送消息

<2> JmsListener对应于EventListener，接收来自ActiveMQ中tokenTopic的消息通知

<3> tokenTopic定义在下面的config中

### 配置ActiveMQ的topic

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

非常简单的配置，因为ActiveMQAutoConfiguration已经帮我们做了相当多的配置，我们只需要顶一个topic即可使用ActiveMQ的功能。

### 查看ActiveMQ的监控端

省略了发送消息的过程，实际上可以得到和Redis PubSub一样的效果。来看一下ActiveMQ自带的监控端，在发送消息后，发生了什么变化，访问本地端口`http://localhost:8161/admin` ，可以看到消息被消费了。

![ActiveMQ监控端](http://ov0zuistv.bkt.clouddn.com/QQ%E5%9B%BE%E7%89%8720170914001552.png)

## 总结

本文介绍了Redis，ActiveMQ的PubSub特性，这是我理解的分布式场景下的事件驱动的使用。事件驱动是一种思想，PubSub是一种模式，Redis，ActiveMQ是一种应用，落到实处，便可以是本文介绍的token这个小小的业务实现。但是注意，使用Redis，ActiveMQ理解事件驱动可以，但是不能等同事件驱动，事件驱动还有很多其他场景下体现，笔者功力不够，无法一一介绍，怕人误解，特此强调一下。

