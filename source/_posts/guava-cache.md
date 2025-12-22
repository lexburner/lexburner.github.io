---
title: Guava Cache 使用小结
toc: true
type: 1
date: 2021-12-27 18:42:35
categories:
- Java
tags:
- JAVA
---

## 闲聊

话说原创文章已经断更 2 个月了，倒也不是因为忙，主要还是懒。但是也感觉可以拿出来跟大家分享的技术点越来越少了，一方面主要是最近在从事一些“内部项目”的研发，纵使我很想分享，也没法搬到公众号 & 博客上来；一方面是一些我并不是很擅长的技术点，在我还是新手时，我敢于去写，而有了一定工作年限之后，反而有些包袱了，我的读者会不会介意呢？思来想去，我回忆起了写作的初心，不就是为了记录自己的学习过程吗？于是乎，我还是按照我之前的文风记录下了此文，以避免成为一名断更的博主。

以下是正文。

## 前言

“缓存”一直是我们程序员聊的最多的那一类技术点，诸如 Redis、Encache、Guava Cache，你至少会听说过一个。需要承认的是，无论是面试八股文的风气，还是实际使用的频繁度，Redis 分布式缓存的确是当下最为流行的缓存技术，但同时，从我个人的项目经验来看，本地缓存也是非常常用的一个技术点。

分析 Redis 缓存的文章很多，例如 Redis 雪崩、Redis 过期机制等等，诸如此类的公众号标题不鲜出现在我朋友圈的 timeline 中，但是分析本地缓存的文章在我的映像中很少。

在最近的项目中，有一位新人同事使用了 Guava Cache 来对一个 RPC 接口的响应进行缓存，我在 review 其代码时恰好发现了一个不太合理的写法，遂有此文。

本文将会介绍 Guava Cache 的一些常用操作：基础 API 使用，过期策略，刷新策略。并且按照我的写作习惯，会附带上实际开发中的一些总结。需要事先说明的是，我没有阅读过 Guava Cache 的源码，对其的介绍仅仅是一些使用经验或者最佳实践，不会有过多深入的解析。

先简单介绍一下 Guava Cache，它是 Google 封装的基础工具包 guava 中的一个内存缓存模块，它主要提供了以下能力：

- 封装了缓存与数据源交互的流程，使得开发更关注于业务操作
- 提供线程安全的存取操作（可以类比 ConcurrentHashMap）
- 提供常用的缓存过期策略，缓存刷新策略
- 提供缓存命中率的监控

## 基础使用

使用一个示例介绍 Guava Cache 的基础使用方法 -- 缓存大小写转换的返回值。

```java
private String fetchValueFromServer(String key) {
    return key.toUpperCase();
}

@Test
public void whenCacheMiss_thenFetchValueFromServer() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return fetchValueFromServer(key);
            }
        });

    assertEquals(0, cache.size());
    assertEquals("HELLO", cache.getUnchecked("hello"));
    assertEquals("HELLO", cache.get("hello"));
    assertEquals(1, cache.size());
}
```

使用 Guava Cache 的好处已经跃然于纸上了，它解耦了缓存存取与业务操作。`CacheLoader` 的 `load` 方法可以理解为从数据源加载原始数据的入口，当调用 LoadingCache 的  `getUnchecked` 或者 `get`方法时，Guava Cache 行为如下：

- 缓存未命中时，同步调用 load 接口，加载进缓存，返回缓存值
- 缓存命中，直接返回缓存值
- 多线程缓存未命中时，A 线程 load 时，会阻塞 B 线程的请求，直到缓存加载完毕

注意到，Guava 提供了两个   `getUnchecked` 或者 `get` 加载方法，没有太大的区别，无论使用哪一个，都需要注意，数据源无论是 RPC 接口的返回值还是数据库，都要考虑访问超时或者失败的情况，做好异常处理。

## 预加载缓存

预加载缓存的常见使用场景：

- 老生常谈的秒杀场景，事先缓存预热，将热点商品加入缓存；
- 系统重启过后，事先加载好缓存，避免真实请求击穿缓存

Guava Cache 提供了 `put` 和 `putAll` 方法

```java
@Test
public void whenPreloadCache_thenPut() {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return fetchValueFromServer(key);
            }
        });

    String key = "kirito";
    cache.put(key,fetchValueFromServer(key));

    assertEquals(1, cache.size());
}
```

操作和 HashMap 一模一样。

这里有一个误区，而那位新人同事恰好踩到了，也是我写这篇文章的初衷，请务必仅在预加载缓存这个场景使用 put，其他任何场景都应该使用 load 去触发加载缓存。看下面这个**反面示例**：

```java
// 注意这是一个反面示例
@Test
public void wrong_usage_whenCacheMiss_thenPut() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return "";
            }
        });

    String key = "kirito";
    String cacheValue = cache.get(key);
    if ("".equals(cacheValue)) {
        cacheValue = fetchValueFromServer(key);
        cache.put(key, cacheValue);
    }
    cache.put(key, cacheValue);

    assertEquals(1, cache.size());
}
```

这样的写法，在 load 方法中设置了一个空值，后续通过手动 put + get 的方式使用缓存，这种习惯更像是在操作一个 HashMap，但并不推荐在 Cache 中使用。在前面介绍过 get 配合 load 是由 Guava Cache 去保障了线程安全，保障多个线程访问缓存时，第一个请求加载缓存的同时，阻塞后续请求，这样的 HashMap 用法既不优雅，在极端情况下还会引发缓存击穿、线程安全等问题。

请务必仅仅将 put 方法用作预加载缓存场景。

## 缓存过期

前面的介绍使用起来依旧没有脱离 ConcurrentHashMap 的范畴，Cache 与其的第一个区别在“缓存过期”这个场景可以被体现出来。本节介绍 Guava 一些常见的缓存过期行为及策略。

### 缓存固定数量的值

```java
@Test
public void whenReachMaxSize_thenEviction() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().maximumSize(3).build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return fetchValueFromServer(key);
            }
        });

    cache.get("one");
    cache.get("two");
    cache.get("three");
    cache.get("four");
    assertEquals(3, cache.size());
    assertNull(cache.getIfPresent("one"));
    assertEquals("FOUR", cache.getIfPresent("four"));
}
```

使用 `ConcurrentHashMap` 做缓存的一个最大的问题，便是我们没有简易有效的手段阻止其无限增长，而 Guava Cache 可以通过初始化 LoadingCache 的过程，配置 `maximumSize` ，以确保缓存内容不导致你的系统出现 OOM。

值得注意的是，我这里的测试用例使用的是除了 `get` 、`getUnchecked` 外的第三种获取缓存的方式，如字面意思描述的那样，`getIfPresent` 在缓存不存在时，并不会触发 `load` 方法加载数据源。

### LRU 过期策略

依旧沿用上述的示例，我们在设置容量为 3 时，仅获悉 LoadingCache 可以存储 3 个值，却并未得知第 4 个值存入后，哪一个旧值需要淘汰，为新值腾出空位。实际上，Guava Cache 默认采取了 LRU 缓存淘汰策略。Least Recently Used 即最近最少使用，这个算法你可能没有实现过，但一定会听说过，在 Guava Cache 中 Used 的语义代表任意一次访问，例如 put、get。继续看下面的示例。

```java
@Test
public void whenReachMaxSize_thenEviction() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().maximumSize(3).build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return fetchValueFromServer(key);
            }
        });

    cache.get("one");
    cache.get("two");
    cache.get("three");
    // access one
    cache.get("one");
    cache.get("four");
    assertEquals(3, cache.size());
    assertNull(cache.getIfPresent("two"));
    assertEquals("ONE", cache.getIfPresent("one"));
}
```

注意此示例与上一节示例的区别：第四次 get 访问 one 后，two 变成了最久未被使用的值，当第四个值 four 存入后，淘汰的对象变成了 two，而不再是 one 了。

### 缓存固定时间

为缓存设置过期时间，也是区分 HashMap 和 Cache 的一个重要特性。Guava Cache 提供了`expireAfterAccess`、 `expireAfterWrite` 的方案，为 LoadingCache 中的缓存值设置过期时间。

```java
@Test
public void whenEntryIdle_thenEviction()
    throws InterruptedException, ExecutionException {

    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().expireAfterAccess(1, TimeUnit.SECONDS).build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return fetchValueFromServer(key);
            }
        });

    cache.get("kirito");
    assertEquals(1, cache.size());

    cache.get("kirito");
    Thread.sleep(2000);

    assertNull(cache.getIfPresent("kirito"));
}
```

## 缓存失效

```java
@Test
public void whenInvalidate_thenGetNull() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder()
            .build(new CacheLoader<String, String>() {
                @Override
                public String load(String key) {
                    return fetchValueFromServer(key);
                }
            });

    String name = cache.get("kirito");
    assertEquals("KIRITO", name);

    cache.invalidate("kirito");
    assertNull(cache.getIfPresent("kirito"));
}
```

使用 `void invalidate(Object key)` 移除单个缓存，使用 `void invalidateAll()` 移除所有缓存。

## 缓存刷新

缓存刷新的常用于使用数据源的新值覆盖缓存旧值，Guava Cache 提供了两类刷新机制：手动刷新和定时刷新。

### 手动刷新

```
cache.refresh("kirito");
```

refresh 方法将会触发 load 逻辑，尝试从数据源加载缓存。

需要注意点的是，refresh 方法并不会阻塞 get 方法，所以在 refresh 期间，旧的缓存值依旧会被访问到，直到 load 完毕，看下面的示例。

```java
@Test
public void whenCacheRefresh_thenLoad()
    throws InterruptedException, ExecutionException {

    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().expireAfterWrite(1, TimeUnit.SECONDS).build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) throws InterruptedException {
                Thread.sleep(2000);
                return key + ThreadLocalRandom.current().nextInt(100);
            }
        });

    String oldValue = cache.get("kirito");

    new Thread(() -> {
        cache.refresh("kirito");
    }).start();

    // make sure another refresh thread is scheduling
    Thread.sleep(500);

    String val1 = cache.get("kirito");

    assertEquals(oldValue, val1);

    // make sure refresh cache 
    Thread.sleep(2000);

    String val2 = cache.get("kirito");
    assertNotEquals(oldValue, val2);

}
```

其实任何情况下，缓存值都有可能和数据源出现不一致，业务层面需要做好访问到旧值的容错逻辑。

### 自动刷新

```java
@Test
public void whenTTL_thenRefresh() throws ExecutionException, InterruptedException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().refreshAfterWrite(1, TimeUnit.SECONDS).build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return key + ThreadLocalRandom.current().nextInt(100);
            }
        });

    String first = cache.get("kirito");
    Thread.sleep(1000);
    String second = cache.get("kirito");

    assertNotEquals(first, second);
}
```

和上节的 refresh 机制一样，`refreshAfterWrite` 同样不会阻塞 get 线程，依旧有访问旧值的可能性。

## 缓存命中统计

Guava Cache 默认情况不会对命中情况进行统计，需要在构建 CacheBuilder 时显式配置 `recordStats`。

```java
@Test
public void whenRecordStats_thenPrint() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().maximumSize(100).recordStats().build(new CacheLoader<String, String>() {
            @Override
            public String load(String key) {
                return fetchValueFromServer(key);
            }
        });

    cache.get("one");
    cache.get("two");
    cache.get("three");
    cache.get("four");

    cache.get("one");
    cache.get("four");

    CacheStats stats = cache.stats();
    System.out.println(stats);
}
---
CacheStats{hitCount=2, missCount=4, loadSuccessCount=4, loadExceptionCount=0, totalLoadTime=1184001, evictionCount=0}
```

## 缓存移除的通知机制

在一些业务场景中，我们希望对缓存失效进行一些监测，或者是针对失效的缓存做一些回调处理，就可以使用 `RemovalNotification`  机制。

```java
@Test
public void whenRemoval_thenNotify() throws ExecutionException {
    LoadingCache<String, String> cache =
        CacheBuilder.newBuilder().maximumSize(3)
            .removalListener(
                cacheItem -> System.out.println(cacheItem + " is removed, cause by " + cacheItem.getCause()))
            .build(new CacheLoader<String, String>() {
                @Override
                public String load(String key) {
                    return fetchValueFromServer(key);
                }
            });

    cache.get("one");
    cache.get("two");
    cache.get("three");
    cache.get("four");
}
---
one=ONE is removed, cause by SIZE
```

`removalListener` 可以给 LoadingCache 增加一个回调处理器，`RemovalNotification` 实例包含了缓存的键值对以及移除原因。

## Weak Keys & Soft Values

Java 基础中的弱引用和软引用的概念相信大家都学习过，这里先给大家复习一下

- **软引用**：如果一个对象只具有**软引用**，则**内存空间充足**时，**垃圾回收器**就**不会**回收它；如果**内存空间不足**，就会**回收**这些对象。只要垃圾回收器没有回收它，该对象就可以被程序使用
- **弱引用**：只具有**弱引用**的对象拥有**更短暂**的**生命周期**。在垃圾回收器线程扫描它所管辖的内存区域的过程中，一旦发现了只具有**弱引用**的对象，不管当前**内存空间足够与否**，都会**回收**它的内存。

在 Guava Cache 中，CacheBuilder 提供了 weakKeys、weakValues、softValues 三种方法，将缓存的键值对与 JVM 垃圾回收机制产生关联。

该操作可能有它适用的场景，例如最大限度的使用 JVM 内存做缓存，但依赖 GC 清理，性能可想而知会比较低。总之我是不会依赖 JVM 的机制来清理缓存的，所以这个特性我不敢使用，线上还是稳定性第一。

如果需要设置清理策略，可以参考缓存过期小结中的介绍固定数量和固定时间两个方案，结合使用确保使用缓存获得高性能的同时，不把内存打挂。

## 总结

本文介绍了 Guava Cache 一些常用的 API 、用法示例，以及需要警惕的一些使用误区。

在选择使用 Guava 时，我一般会结合实际使用场景，做出以下的考虑：

1. 为什么不用 Redis？

   如果本地缓存能够解决，我不希望额外引入一个中间件。

2. 如果保证缓存和数据源数据的一致性？

   一种情况，我会在数据要求敏感度不高的场景使用缓存，所以短暂的不一致可以忍受；另外一些情况，我会在设置定期刷新缓存以及手动刷新缓存的机制。举个例子，页面上有一个显示应用 developer 列表的功能，而本地仅存储了应用名，developer 列表是通过一个 RPC 接口查询获取的，而由于对方的限制，该接口 qps 承受能力非常低，便可以考虑缓存 developer 列表，并配置 maximumSize 以及 expireAfterAccess。如果有用户在 developer 数据源中新增了数据，导致了数据不一致，页面也可以设置一个同步按钮，让用户去主动 refresh；或者，如果判断当前用户不在 developer 列表，也可以程序 refresh 一次。总之非常灵活，使用 Guava Cache 的 API 可以满足大多数业务场景的缓存需求。

3. 为什么是 Guava Cache，它的性能怎么样？

   我现在主要是出于稳定性考虑，项目一直在使用 Guava Cache。据说有比 Guava Cache 快的本地缓存，但那点性能我的系统不是特别关心。



