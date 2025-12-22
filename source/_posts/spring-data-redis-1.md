---
title: Spring Data Redis（一）-- 解析 RedisTemplate
date: 2017-10-27 16:10:55
tags:
- Spring Data Redis
categories:
- Spring
toc: true
---

谈及系统优化，缓存一直是不可或缺的一点。在缓存中间件层面，我们有 MemCache，Redis 等选择；在系统分层层面，又需要考虑多级缓存；在系统可用性层面，又要考虑到缓存雪崩，缓存穿透，缓存失效等常见的缓存问题... 缓存的使用与优化值得我们花费一定的精力去深入理解。《Spring Data Redis》这个系列打算围绕 spring-data-redis 来进行分析，从 hello world 到源码分析，夹杂一些不多实战经验（经验有限），不止限于 spring-data-redis 本身，也会扩展谈及缓存这个大的知识点。

至于为何选择 redis，相信不用我赘述，redis 如今非常流行，几乎成了项目必备的组件之一。而 spring-boot-starter-data-redis 模块又为我们在 spring 集成的项目中提供了开箱即用的功能，更加便捷了我们开发。系列的第一篇便是简单介绍下整个组件最常用的一个工具类：RedisTemplate。

<!-- more -->

## 1 引入依赖

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>1.5.7.RELEASE</version>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

springboot 的老用户会发现 redis 依赖名称发生了一点小的变化，在 springboot1.4 之前，redis 依赖的名称为：spring-boot-starter-redis，而在之后较新的版本中，使用 spring-boot-starter-redis 依赖，则会在项目启动时得到一个过期警告。意味着，我们应该彻底放弃旧的依赖。spring-data 这个项目定位为 spring 提供一个统一的数据仓库接口，如（spring-boot-starter-data-jpa,spring-boot-starter-data-mongo,spring-boot-starter-data-rest），将 redis 纳入后，改名为了 spring-boot-starter-data-redis。

## 2 配置 redis 连接

`resources/application.yml`

```yaml
spring:
  redis:
    host: 127.0.0.1
    database: 0
    port: 6379
    password: 
```

本机启动一个单点的 redis 即可，使用 redis 的 0 号库作为默认库（默认有 16 个库），在生产项目中一般会配置 redis 集群和哨兵保证 redis 的高可用，同样可以在 application.yml 中修改，非常方便。

## 3 编写测试类

```java
import org.assertj.core.api.Assertions;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.test.context.junit4.SpringRunner;

@RunWith(SpringRunner.class)
@SpringBootTest
public class ApplicationTests {
   @Autowired
   private RedisTemplate redisTemplate;// <1>

   @Test
   public void test() throws Exception {
     redisTemplate.opsForValue().set("student:1", "kirito"); // <2>
     Assertions.assertThat(redisTemplate.opsForValue().get("student:1")).isEqualTo("kirito");
   }
}
```

<1> 引入了 RedisTemplate，这个类是 spring-starter-data-redis 提供给应用直接访问 redis 的入口。从其命名就可以看出，其是模板模式在 spring 中的体现，与 restTemplate，jdbcTemplate 类似，而 springboot 为我们做了自动的配置，具体会在下文详解。

<2> redisTemplate 通常不直接操作键值，而是通过 opsForXxx() 访问，在本例中，key 和 value 均为字符串类型。绑定字符串在实际开发中也是最为常用的操作类型。

## 4 详解 RedisTemplate 的 API

RedisTemplate 为我们操作 Redis 提供了丰富的 API，可以将他们简单进行下归类。

### 4.1 常用数据操作

这一类 API 也是我们最常用的一类。

众所周知，redis 存在 5 种数据类型：

字符串类型（string），散列类型（hash），列表类型（list），集合类型（set），有序集合类型（zset）

而 redisTemplate 实现了 RedisOperations 接口，在其中，定义了一系列与 redis 相关的基础数据操作接口，数据类型分别于下来 API 对应：

```java
// 非绑定 key 操作
ValueOperations<K, V> opsForValue();
<HK, HV> HashOperations<K, HK, HV> opsForHash();
ListOperations<K, V> opsForList();
SetOperations<K, V> opsForSet();
ZSetOperations<K, V> opsForZSet();
// 绑定 key 操作
BoundValueOperations<K, V> boundValueOps(K key);
<HK, HV> BoundHashOperations<K, HK, HV> boundHashOps(K key);
BoundListOperations<K, V> boundListOps(K key);
BoundSetOperations<K, V> boundSetOps(K key);
BoundZSetOperations<K, V> boundZSetOps(K key);
```

若以 bound 开头，则意味着在操作之初就会绑定一个 key，后续的所有操作便默认认为是对该 key 的操作，算是一个小优化。

### 4.2 对原生 Redis 指令的支持

Redis 原生指令中便提供了一些很有用的操作，如设置 key 的过期时间，判断 key 是否存在等等...

常用的 API 列举：

| RedisTemplate API                   | 原生 Redis 指令          | 说明                                       |
| ----------------------------------- | ------------------ | ---------------------------------------- |
| public void delete(K key)           | DEL key [key ...]  | 删除给定的一个或多个 `key`                         |
| public Boolean hasKey(K key)        | EXISTS key         | 检查给定 `key` 是否存在                          |
| public Boolean expire/expireAt(...) | EXPIRE key seconds | 为给定 `key` 设置生存时间，当 `key` 过期时 (生存时间为 `0`)，它会被自动删除。 |
| public Long getExpire(K key)        | TTL key            | 以秒为单位，返回给定 `key` 的剩余生存时间 (TTL, time to live)。 |

更多的原生 Redis 指令支持可以参考 javadoc

### 4.3 CAS 操作

CAS（Compare and Swap）通常有 3 个操作数，内存值 V，旧的预期值 A，要修改的新值 B。当且仅当预期值 A 和内存值 V 相同时，将内存值 V 修改为 B，否则什么都不做。CAS 也通常与并发，乐观锁，非阻塞，机器指令等关键词放到一起讲解。可能会有很多朋友在秒杀场景的架构设计中见到了 Redis，本质上便是利用了 Redis 分布式共享内存的特性以及一系列的 CAS 指令。还记得在 4.1 中通过 redisTemplate.opsForValue()或者 redisTemplate.boundValueOps() 可以得到一个 ValueOperations 或 BoundValueOperations 接口 (以值为字符串的操作接口为例)，这些接口除了提供了基础操作外，还提供了一系列 CAS 操作，也可以放到 RedisTemplate 中一起理解。

常用的 API 列举：

| ValueOperations API                      | 原生 Redis 指令               | 说明                                       |
| :--------------------------------------- | :---------------------- | :--------------------------------------- |
| Boolean setIfAbsent(K key, V value)      | SETNX key value         | 将 `key` 的值设为 `value` ，当且仅当 `key` 不存在。设置成功，返回 `1` ， 设置失败，返回 `0` 。 |
| V getAndSet(K key, V value)              | GETSET key value        | 将给定 `key` 的值设为 `value` ，并返回 `key` 的旧值 (old value)。 |
| Long increment(K key, long delta)/Double increment(K key, double delta) | INCR/INCRBY/INCRBYFLOAT | 将 `key` 所储存的值加上增量 `increment` 。 如果 `key` 不存在，那么 `key` 的值会先被初始化为 `0` ，然后再执行 INCR/INCRBY/INCRBYFLOAT 命令。线程安全的 + |

关于 CAS 的理解可以参考我之前的文章 [java 并发实践 --CAS](https://www.cnkirito.moe/2017/03/12/java%E5%B9%B6%E5%8F%91%E5%AE%9E%E8%B7%B5--ConcurrentHashMap%E4%B8%8ECAS/) 或者其他博文。

### 4.4 发布订阅

redis 之所以被冠以银弹，万金油的称号，关键在于其实现的功能真是太多了，甚至实现了一部分中间件队列的功能，其内置的 channel 机制，可以用于实现分布式的队列和广播。

RedisTemplate 提供了 convertAndSend()功能，用于发送消息，与 RedisMessageListenerContainer 配合接收，便实现了一个简易的发布订阅。如果想要使用 Redis 实现发布订阅，可以参考我之前的文章。[ 浅析分布式下的事件驱动机制](https://www.cnkirito.moe/2017/09/13/event-2/)

### 4.5 Lua 脚本

RedisTemplate 中包含了这样一个 Lua 执行器，意味着我们可以使用 RedisTemplate 执行 Lua 脚本。

```java
private ScriptExecutor<K> scriptExecutor;
```

Lua 这门语言也非常有意思，小巧而精悍，有兴趣的朋友可以去了解一下 nginx+lua 开发，使用 openResty 框架。而 Redis 内置了 Lua 的解析器，由于 Redis 单线程的特性（不严谨），可以使用 Lua 脚本，完成一些线程安全的符合操作（CAS 操作仅仅只能保证单个操作的线程安全，无法保证复合操作，如果你有这样的需求，可以考虑使用 Redis+Lua 脚本）。

```java
public <T> T execute(RedisScript<T> script, List<K> keys, Object... args) {
   return scriptExecutor.execute(script, keys, args);
}
```

上述操作便可以完成对 Lua 脚本的调用。这儿有一个简单的示例，使用 Redis+Lua 脚本实现分布式的应用限流。[分布式限流](https://www.cnkirito.moe/2017/03/18/%E5%88%86%E5%B8%83%E5%BC%8F%E9%99%90%E6%B5%81/)

### 5 总结

Spring Data Redis 系列的第一篇，介绍了 spring-data 对 redis 操作的封装，顺带了解 redis 具备的一系列特性，如果你对 redis 的理解还仅仅停留在它是一个分布式的 key-value 数据库，那么相信现在你一定会感叹其竟然如此强大。后续将会对缓存在项目中的应用以及 spring-boot-starter-data-redis 进一步解析。
