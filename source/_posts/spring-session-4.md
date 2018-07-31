---
title: 从Spring-Session源码看Session机制的实现细节
date: 2018-04-17 20:57:43
tags: 
- Spring Session
- Spring
categories:
- Spring Session
---

去年我曾经写过几篇和 Spring Session 相关的文章，从一个未接触过 Spring Session 的初学者视角介绍了 Spring Session 如何上手，如果你未接触过 Spring Session，推荐先阅读下「从零开始学习Spring Session」系列（https://www.cnkirito.moe/categories/Spring-Session/） Spring Session 主要解决了分布式场景下 Session 的共享问题，本文将从 Spring Session 的源码出发，来讨论一些 Session 设计的细节。
<!-- more -->
### Spring Session 数据结构解读

想象一个场景，现在一到面试题呈现在你面前，让你从零开始设计一个 Session 存储方案，你会怎么回答？

说白了就是让你设计一套数据结构存储 Session，并且我相信提出这个问题时，大多数读者脑海中会浮现出 redis，设计一个 map，使用 ttl 等等，但没想到的细节可能会更多。先来预览一下 Spring Session 的实际数据结构是什么样的（使用 spring-session-redis 实现），当我们访问一次集成了Spring Session 的 web 应用时

```java
@RequestMapping("/helloworld")
public String hello(HttpSession session){
  session.setAttribute("name","xu");
  return "hello.html";
}
```

可以在 Redis 中看到如下的数据结构：

```
A) "spring:session:sessions:39feb101-87d4-42c7-ab53-ac6fe0d91925"

B) "spring:session:expirations:1523934840000"

C) "spring:session:sessions:expires:39feb101-87d4-42c7-ab53-ac6fe0d91925"
```

这三种键职责的分析将会贯彻全文，为了统一叙述，在此将他们进行编号，后续简称为 A 类型键，B 类型键，C 类型键。先简单分析下他们的特点

- 他们公用的前缀是 spring:session
- A 类型键的组成是前缀 +"sessions"+sessionId，对应的值是一个 hash 数据结构。在我的 demo 中，其值如下

```json
{
    "lastAccessedTime": 1523933008926,/*2018/4/17 10:43:28*/
    "creationTime": 1523933008926, /*2018/4/17 10:43:28*/
    "maxInactiveInterval": 1800,
    "sessionAttr:name": "xu"
}
```

其中 creationTime（创建时间），lastAccessedTime（最后访问时间），maxInactiveInterval（session 失效的间隔时长） 等字段是系统字段，sessionAttr:xx 可能会存在多个键值对，用户存放在 session 中的数据如数存放于此。

A 类型键对应的默认 TTL 是 35 分钟。

- B 类型键的组成是前缀+"expirations"+时间戳，无需纠结这个时间戳的含义，先卖个关子。其对应的值是一个 set 数据结构，这个 set 数据结构中存储着一系列的 C 类型键。在我的 demo 中，其值如下

```json
[
    "expires:39feb101-87d4-42c7-ab53-ac6fe0d91925"
]
```

B 类型键对应的默认 TTL 是 30 分钟

- C 类型键的组成是前缀+"sessions:expires"+sessionId，对应一个空值，它仅仅是 sessionId 在 redis 中的一个引用，具体作用继续卖关子。

C 类型键对应的默认 TTL 是 30 分钟。

### kirito-session 的天使轮方案

介绍完 Spring Session 的数据结构，我们先放到一边，来看看如果我们自己设计一个 Session 方案，拟定为 kirito-session 吧，该如何设计。

kirito 的心路历程是这样的：“使用 redis 存 session 数据，对，session 需要有过期机制，redis 的键可以自动过期，肯定很方便。”

于是 kirito 设计出了 spring-session 中的 A 类型键，复用它的数据结构：

```Json
{
    "lastAccessedTime": 1523933008926,
    "creationTime": 1523933008926, 
    "maxInactiveInterval": 1800,
    key/value...
}
```

然后对 A 类型的键设置 ttl A 30 分钟，这样 30分钟之后 session 过期，0-30 分钟期间如果用户持续操作，那就根据 sessionId 找到 A 类型的 key，刷新 lastAccessedTime 的值，并重新设置 ttl，这样就完成了「续签」的特性。

显然 Spring Session 没有采用如此简练的设计，为什么呢？翻看 Spring Session 的文档

> One problem with relying on Redis expiration exclusively is that Redis makes no guarantee of when the expired event will be fired if the key has not been accessed. Specifically the background task that Redis uses to clean up expired keys is a low priority task and may not trigger the key expiration. For additional details see [Timing of expired events](http://redis.io/topics/notifications) section in the Redis documentation.

大致意思是说，redis 的键过期机制不“保险”，这和 redis 的设计有关，不在此拓展开，研究这个的时候翻了不少资料，得出了如下的总结：

1. redis 在键实际过期之后不一定会被删除，可能会继续存留，但具体存留的时间我没有做过研究，可能是 1~2 分钟，可能会更久。
2. 具有过期时间的 key 有两种方式来保证过期，一是这个键在过期的时候被访问了，二是后台运行一个定时任务自己删除过期的 key。划重点：**这启发我们在 key 到期后只需要访问一下 key 就可以确保 redis 删除该过期键**
3. 如果没有指令持续关注 key，并且 redis 中存在许多与 TTL 关联的 key，则 key 真正被删除的时间将会有显著的延迟！显著的延迟！显著的延迟！

天使轮计划惨遭破产，看来单纯依赖于 redis 的过期时间是不可靠的，秉持着力求严谨的态度，迎来了 A 轮改造。

### A 轮改造—引入 B 类型键确保 session 的过期机制

redis 的官方文档启发我们，可以启用一个后台定时任务，定时去删除那些过期的键，配合上 redis 的自动过期，这样可以双重保险。第一个问题来了，我们将这些过期键存在哪儿呢？不找个合适的地方存起来，定时任务到哪儿去删除这些应该过期的键呢？总不能扫描全库吧！来解释我前面卖的第一个关子，看看 B 类型键的特点：

```
spring:session:expirations:1523934840000
```

#### 时间戳的含义

1523934840000 这明显是个 Unix 时间戳，它的含义是存放着这一分钟内应该过期的键，所以它是一个 set 数据结构。解释下这个时间戳是怎么计算出来的org.springframework.session.data.redis.RedisSessionExpirationPolicy#roundUpToNextMinute

```java
static long roundUpToNextMinute(long timeInMs) {
		Calendar date = Calendar.getInstance();
		date.setTimeInMillis(timeInMs);
		date.add(Calendar.MINUTE, 1);
		date.clear(Calendar.SECOND);
		date.clear(Calendar.MILLISECOND);
		return date.getTimeInMillis();
	}
```

还记得 lastAccessedTime=1523933008926，maxInactiveInterval=1800 吧，lastAccessedTime 转换成北京时间是: `2018/4/17 10:43:28`，向上取整是`2018/4/17 10:44:00`，再次转换为 Unix 时间戳得到 1523932980000，单位是 ms，1800 是过期时间的间隔，单位是 s，二者相加 1523932980000+1800*1000=1523934840000。这样 B 类型键便作为了一个「桶」，存放着这一分钟应当过期的 session 的 key。

#### 后台定时任务

org.springframework.session.data.redis.RedisSessionExpirationPolicy#cleanupExpiredSessions

```Java
@Scheduled(cron = "${spring.session.cleanup.cron.expression:0 * * * * *}")
public void cleanupExpiredSessions() {
   this.expirationPolicy.cleanExpiredSessions();
}
```

后台提供了定时任务去“删除”过期的 key，来补偿 redis 到期未删除的 key。方案再描述下，方便大家理解：取得当前时间的时间戳作为 key，去 redis 中定位到 spring:session:expirations:{当前时间戳} ，这个 set 里面存放的便是所有过期的 key 了。

#### 续签的影响

每次 session 的续签，需要将旧桶中的数据移除，放到新桶中。验证这一点很容易。

在第一分钟访问一次 http://localhost:8080/helloworld 端点，得到的 B 类型键为：spring:session:expirations:1523934840000；第二分钟再访问一次 http://localhost:8080/helloworld 端点，A 类型键的 lastAccessedTime 得到更新，并且 spring:session:expirations:1523934840000 这个桶被删除了，新增了 spring:session:expirations:1523934900000 这个桶。当众多用户活跃时，桶的增删和以及 set 中数据的增删都是很频繁的。对了，没提到的一点，对应 key 的 ttl 时间也会被更新。

kirito-session 方案貌似比之前严谨了，目前为止使用了 A 类型键和 B 类型键解决了 session 存储和 redis 键到期不删除的两个问题，但还是存在问题的。

### B 轮改造—优雅地解决 B 类型键的并发问题

引入 B 类型键看似解决了问题，却也引入了一个新的问题：并发问题。

来看看一个场景：

假设存在一个 sessionId=1 的会话，初始时间戳为 1420656360000

```java
spring:session:expirations:1420656360000 -> [1]
spring:session:session:1 -> <session>
```

接下来迎来了并发访问，（用户可能在浏览器中多次点击）：

- 线程 1 在第 2 分钟请求，产生了续签，session:1 应当从 1420656360000 这个桶移动到 142065642000 这个桶
- 线程 2 在第 3 分钟请求，也产生了续签，session:1 本应当从 1420656360000 这个桶移动到 142065648000 这个桶
- 如果上两步按照次序执行，自然不会有问题。但第 3 分钟的请求可能已经执行完毕了，第 2 分钟才刚开始执行。

像下面这样：

线程 2 从第一分钟的桶中移除 session:1，并移动到第三分钟的桶中

```
spring:session:expirations:1420656360000 -> []
spring:session:session:1 -> <session>
spring:session:expirations:1420656480000 -> [1]
```

线程 1 完成相同的操作，它也是基于第一分钟来做的，但会移动到第二分钟的桶中

```
spring:session:expirations:1420656360000 -> []
spring:session:session:1 -> <session>
spring:session:expirations:1420656420000 -> [1]
```

最后 redis 中键的情况变成了这样：

```
spring:session:expirations:1420656360000 -> []
spring:session:session:1 -> <session>
spring:session:expirations:1420656480000 -> [1]
spring:session:expirations:1420656420000 -> [1]
```

后台定时任务会在第 32 分钟扫描到 spring:session:expirations:1420656420000 桶中存在的 session，这意味着，本应该在第 33 分钟才会过期的 key，在第 32 分钟就会被删除！

一种简单的方法是用户的每次 session 续期加上分布式锁，这显然不能被接受。来看看 Spring Session 是怎么巧妙地应对这个并发问题的。

org.springframework.session.data.redis.RedisSessionExpirationPolicy#cleanExpiredSessions

```java
public void cleanExpiredSessions() {
   long now = System.currentTimeMillis();
   long prevMin = roundDownMinute(now);

   if (logger.isDebugEnabled()) {
      logger.debug("Cleaning up sessions expiring at " + new Date(prevMin));
   }

   // 获取到 B 类型键
   String expirationKey = getExpirationKey(prevMin);
   // 取出当前这一分钟应当过期的 session
   Set<Object> sessionsToExpire = this.redis.boundSetOps(expirationKey).members();
   // 注意：这里删除的是 B 类型键，不是删除 session 本身！
   this.redis.delete(expirationKey);
   for (Object session : sessionsToExpire) {
      String sessionKey = getSessionKey((String) session);
      // 遍历一下 C 类型的键
      touch(sessionKey);
   }
}

/**
 * By trying to access the session we only trigger a deletion if it the TTL is
 * expired. This is done to handle
 * https://github.com/spring-projects/spring-session/issues/93
 *
 * @param key the key
 */
private void touch(String key) {
   // 并不是删除 key，而只是访问 key
   this.redis.hasKey(key);
}
```

这里面逻辑主要是拿到过期键的集合（实际上是 C 类型的 key，但这里可以理解为 sessionId，C 类型我下面会介绍），此时这个集合里面存在三种类型的 sessionId。

1. 已经被 redis 删除的过期键。万事大吉，redis 很靠谱的及时清理了过期的键。
2. 已经过期，但是还没来得及被 redis 清除的 key。还记得前面 redis 文档里面提到的一个技巧吗？我们在 key 到期后只需要访问一下 key 就可以确保 redis 删除该过期键，所以 redis.hasKey(key); 该操作就是为了触发 redis 的自己删除。
3. 并发问题导致的多余数据，实际上并未过期。如上所述，第 32 分钟的桶里面存在的 session:1 实际上并不应该被删除，使用 touch 的好处便是我只负责检测，删不删交给 redis 判断。session:1 在第 32 分钟被 touch 了一次，并未被删除，在第 33 分钟时应当被 redis 删除，但可能存在延时，这个时候 touch 一次，确保删除。

所以，源码里面特别强调了一下：要用 touch 去触发 key 的删除，而不能直接 del key。

> 参考 https://github.com/spring-projects/spring-session/issues/93

### C 轮改造—增加 C 类型键完善过期通知事件

虽然引入了 B 类型键，并且在后台加了定时器去确保 session 的过期，但似乎…emmmmm...还是不够完善。在此之前，kirito-session 的设计方案中，存储 session 实际内容的 A 类型键和用于定时器确保删除的桶 B 类型键过期时间都是 30 分钟(key 的 TTL 是 30 分钟)，注意一个细节，spring-session 中 A 类型键的过期时间是 35 分钟，比实际的 30 分钟多了 5 分钟，这意味着即便 session 已经过期，我们还是可以在 redis 中有 5 分钟间隔来操作过期的 session。于此同时，spring-session 引入了 C 类型键来作为 session 的引用。

解释下之前卖的第二个关子，C 类型键的组成为前缀+"sessions:expires"+sessionId，对应一个空值，同时也是 B 类型键桶中存放的 session 引用，ttl 为 30 分钟，具体作用便是在自身过期后触发 redis 的  [keyspace notifications](http://redis.io/topics/notifications) (http://redis.io/topics/notifications)，具体如何监听 redis 的过期事件简单介绍下：org.springframework.session.data.redis.config.ConfigureNotifyKeyspaceEventsAction 该类配置了相关的过期监听，并使用 SessionExpiredEvent 事件发放 session 的过期事件。为什么引入 C 类型键？keyspace notifications 只会告诉我们哪个键过期了，不会告诉我们内容是什么。**关键就在于如果 session 过期后监听器可能想要访问 session 的具体内容，然而自身都过期了，还怎么获取内容**。所以，C 类型键存在的意义便是解耦 session 的存储和 session 的过期，并且使得 server 获取到过期通知后可以访问到 session 真实的值。对于用户来说，C 类型键过期后，意味着登录失效，而对于服务端而言，真正的过期其实是 A 类型键过期，这中间会有 5 分钟的误差。

### 一点点想法，担忧，疑惑

本文大概介绍了 Spring Session 的三种 key 的原因，理清楚其中的逻辑花了不少时间，项目改造正好涉及到相关的缓存值过期这一需求，完全可以参考 Spring Session 的方案。但担忧也是有的，如果真的只是 1~2 两分钟的延迟过期（对应 A 轮改造中遇到的问题），以及 1 分钟的提前删除（对应 B 轮改造中的并发问题）其实个人感觉没必要计较。从产品体验上来说，用户应该不会在意 32 分钟自动退出和 30 分钟退出，可以说 Spring Session 是为了严谨而设计了这一套方案，但引入了定时器和很多辅助的键值对，无疑对内存消耗和 cpu 消耗都是一种浪费。如果在生产环境大量使用 Spring Session，最好权衡下本文提及的相关问题。

**欢迎关注我的微信公众号：「Kirito的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://ov0zuistv.bkt.clouddn.com/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)