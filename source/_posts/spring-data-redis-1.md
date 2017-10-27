---
title: Spring Data Redis（一）--解析RedisTemplate
date: 2017-10-27 16:10:55
tags:
- Spring Data Redis
categories:
- Spring Data Redis
---

谈及系统优化，缓存一直是不可或缺的一点。在缓存中间件层面，我们有MemCache，Redis等选择；在系统分层层面，又需要考虑多级缓存；在系统可用性层面，又要考虑到缓存雪崩，缓存穿透，缓存失效等常见的缓存问题...缓存的使用与优化值得我们花费一定的精力去深入理解。《Spring Data Redis》这个系列打算围绕spring-data-redis来进行分析，从hello world到源码分析，夹杂一些不多实战经验（经验有限），不止限于spring-data-redis本身，也会扩展谈及缓存这个大的知识点。

至于为何选择redis，相信不用我赘述，redis如今非常流行，几乎成了项目必备的组件之一。而spring-boot-starter-data-redis模块又为我们在spring集成的项目中提供了开箱即用的功能，更加便捷了我们开发。系列的第一篇便是简单介绍下整个组件最常用的一个工具类：RedisTemplate。

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

springboot的老用户会发现redis依赖名称发生了一点小的变化，在springboot1.4之前，redis依赖的名称为：spring-boot-starter-redis，而在之后较新的版本中，使用spring-boot-starter-redis依赖，则会在项目启动时得到一个过期警告。意味着，我们应该彻底放弃旧的依赖。spring-data这个项目定位为spring提供一个统一的数据仓库接口，如（spring-boot-starter-data-jpa,spring-boot-starter-data-mongo,spring-boot-starter-data-rest），将redis纳入后，改名为了spring-boot-starter-data-redis。

## 2 配置redis连接

`resources/application.yml`

```yaml
spring:
  redis:
    host: 127.0.0.1
    database: 0
    port: 6379
    password: 
```

本机启动一个单点的redis即可，使用redis的0号库作为默认库（默认有16个库），在生产项目中一般会配置redis集群和哨兵保证redis的高可用，同样可以在application.yml中修改，非常方便。

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

<1> 引入了RedisTemplate，这个类是spring-starter-data-redis提供给应用直接访问redis的入口。从其命名就可以看出，其是模板模式在spring中的体现，与restTemplate，jdbcTemplate类似，而springboot为我们做了自动的配置，具体会在下文详解。

<2> redisTemplate通常不直接操作键值，而是通过opsForXxx()访问，在本例中，key和value均为字符串类型。绑定字符串在实际开发中也是最为常用的操作类型。

## 4 详解RedisTemplate的API

RedisTemplate为我们操作Redis提供了丰富的API，可以将他们简单进行下归类。

### 4.1 常用数据操作

这一类API也是我们最常用的一类。

众所周知，redis存在5种数据类型：

字符串类型（string），散列类型（hash），列表类型（list），集合类型（set），有序集合类型（zset）

而redisTemplate实现了RedisOperations接口，在其中，定义了一系列与redis相关的基础数据操作接口，数据类型分别于下来API对应：

```java
//非绑定key操作
ValueOperations<K, V> opsForValue();
<HK, HV> HashOperations<K, HK, HV> opsForHash();
ListOperations<K, V> opsForList();
SetOperations<K, V> opsForSet();
ZSetOperations<K, V> opsForZSet();
//绑定key操作
BoundValueOperations<K, V> boundValueOps(K key);
<HK, HV> BoundHashOperations<K, HK, HV> boundHashOps(K key);
BoundListOperations<K, V> boundListOps(K key);
BoundSetOperations<K, V> boundSetOps(K key);
BoundZSetOperations<K, V> boundZSetOps(K key);
```

若以bound开头，则意味着在操作之初就会绑定一个key，后续的所有操作便默认认为是对该key的操作，算是一个小优化。

### 4.2 对原生Redis指令的支持

Redis原生指令中便提供了一些很有用的操作，如设置key的过期时间，判断key是否存在等等...

常用的API列举：

| RedisTemplate API                   | 原生Redis指令          | 说明                                       |
| ----------------------------------- | ------------------ | ---------------------------------------- |
| public void delete(K key)           | DEL key [key ...]  | 删除给定的一个或多个 `key`                         |
| public Boolean hasKey(K key)        | EXISTS key         | 检查给定 `key` 是否存在                          |
| public Boolean expire/expireAt(...) | EXPIRE key seconds | 为给定 `key` 设置生存时间，当 `key` 过期时(生存时间为 `0` )，它会被自动删除。 |
| public Long getExpire(K key)        | TTL key            | 以秒为单位，返回给定 `key` 的剩余生存时间(TTL, time to live)。 |

更多的原生Redis指令支持可以参考javadoc

### 4.3 CAS操作

CAS（Compare and Swap）通常有3个操作数，内存值V，旧的预期值A，要修改的新值B。当且仅当预期值A和内存值V相同时，将内存值V修改为B，否则什么都不做。CAS也通常与并发，乐观锁，非阻塞，机器指令等关键词放到一起讲解。可能会有很多朋友在秒杀场景的架构设计中见到了Redis，本质上便是利用了Redis分布式共享内存的特性以及一系列的CAS指令。还记得在4.1中通过redisTemplate.opsForValue()或者redisTemplate.boundValueOps()可以得到一个ValueOperations或BoundValueOperations接口(以值为字符串的操作接口为例)，这些接口除了提供了基础操作外，还提供了一系列CAS操作，也可以放到RedisTemplate中一起理解。

常用的API列举：

| ValueOperations API                      | 原生Redis指令               | 说明                                       |
| :--------------------------------------- | :---------------------- | :--------------------------------------- |
| Boolean setIfAbsent(K key, V value)      | SETNX key value         | 将 `key` 的值设为 `value` ，当且仅当 `key` 不存在。设置成功，返回 `1` ， 设置失败，返回 `0` 。 |
| V getAndSet(K key, V value)              | GETSET key value        | 将给定 `key` 的值设为 `value` ，并返回 `key` 的旧值(old value)。 |
| Long increment(K key, long delta)/Double increment(K key, double delta) | INCR/INCRBY/INCRBYFLOAT | 将 `key` 所储存的值加上增量 `increment` 。 如果 `key` 不存在，那么 `key` 的值会先被初始化为 `0` ，然后再执行INCR/INCRBY/INCRBYFLOAT命令。线程安全的+ |

关于CAS的理解可以参考我之前的文章[java并发实践--CAS](https://www.cnkirito.moe/2017/03/12/java%E5%B9%B6%E5%8F%91%E5%AE%9E%E8%B7%B5--ConcurrentHashMap%E4%B8%8ECAS/)或者其他博文。

### 4.4 发布订阅

redis之所以被冠以银弹，万金油的称号，关键在于其实现的功能真是太多了，甚至实现了一部分中间件队列的功能，其内置的channel机制，可以用于实现分布式的队列和广播。

RedisTemplate提供了convertAndSend()功能，用于发送消息，与RedisMessageListenerContainer 配合接收，便实现了一个简易的发布订阅。如果想要使用Redis实现发布订阅，可以参考我之前的文章。[浅析分布式下的事件驱动机制](https://www.cnkirito.moe/2017/09/13/event-2/)

### 4.5 Lua脚本

RedisTemplate中包含了这样一个Lua执行器，意味着我们可以使用RedisTemplate执行Lua脚本。

```java
private ScriptExecutor<K> scriptExecutor;
```

Lua这门语言也非常有意思，小巧而精悍，有兴趣的朋友可以去了解一下nginx+lua开发，使用openResty框架。而Redis内置了Lua的解析器，由于Redis单线程的特性（不严谨），可以使用Lua脚本，完成一些线程安全的符合操作（CAS操作仅仅只能保证单个操作的线程安全，无法保证复合操作，如果你有这样的需求，可以考虑使用Redis+Lua脚本）。

```java
public <T> T execute(RedisScript<T> script, List<K> keys, Object... args) {
   return scriptExecutor.execute(script, keys, args);
}
```

上述操作便可以完成对Lua脚本的调用。这儿有一个简单的示例，使用Redis+Lua脚本实现分布式的应用限流。[分布式限流](https://www.cnkirito.moe/2017/03/18/%E5%88%86%E5%B8%83%E5%BC%8F%E9%99%90%E6%B5%81/)

### 5 总结

Spring Data Redis系列的第一篇，介绍了spring-data对redis操作的封装，顺带了解redis具备的一系列特性，如果你对redis的理解还仅仅停留在它是一个分布式的key-value数据库，那么相信现在你一定会感叹其竟然如此强大。后续将会对缓存在项目中的应用以及spring-boot-starter-data-redis进一步解析。