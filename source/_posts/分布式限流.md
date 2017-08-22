---
title: 分布式限流
date: 2017-03-18 13:52:00
tags: 
- redis
- lua
categories: 
- 架构设计
---

## 前言

最近正在为本科论文的事感到心烦，一方面是在调研期间，发现大部分的本科论文都是以MVC为架构，如果是使用了java作为开发语言则又是千篇一律的在使用SSH，二方面是自己想就微服务，分布式方面写一篇论文，讲述一些技术点的实现，和一些中间件的使用，看到如八股文般的模板格式..不免让人望文生怯。退一步，投入模板化ssh-web项目的怀抱，落入俗套，可以省去自己不少时间，因为在外实习，琐事并不少；进一步，需要投入大量时间精力去研究，而且不成体系，没有论文参考。

突然觉得写博客，比写论文爽多了，可以写自己想写的，记录自己最真实的想法。可能会逐渐将之前博客维护的自己的一些想法，纳入到本科论文中去。

## 经典限流算法

说回正题，补上之前分布式限流的实现。先介绍一些现有的限流方案。

核心的算法主要就是四种：
A类：计数器法，滑动窗口法
B类：令牌桶法，漏桶法

这里的四种算法通常都是在应用级别讨论的，这里不重复介绍这四种算法的实现思路了，只不过我人为的将他们分成了A，B两类。

 - A类算法，是否决式限流。即如果系统设定限流方案是1分钟允许100次调用，那么真实请求1分钟调用200次的话，意味着超出的100次调用，得到的是空结果或者调用频繁异常。

 - B类算法，是阻塞式限流。即如果系统设定限流方案是1分钟允许100次调用，那么真实请求1分钟调用200次的话，意味着超出的100次调用，会均匀安排到下一分钟返回。（当然B类算法，也可以立即返回失败，也可以达到否决式限流的效果）

B类算法，如Guava包提供的RateLimiter，内部其实就是一个阻塞队列，达到阻塞限流的效果。然后分布式场景下，有一些思路悄悄的发生了变化。多个模块之间不能保证相互阻塞，共享的变量也不在一片内存空间中。为了使用阻塞限流的算法，我们不得不将统计流量放到redis一类的共享内存中，如果操作是一系列复合的操作，我们还不能使用redis自带的CAS操作(CAS操作只能保证单个操作的原子性)或者使用中间件级别的队列来阻塞操作，显示加分布式锁的开销又是非常的巨大。最终选择放弃阻塞式限流，而在分布式场景下，仅仅使用redis+lua脚本的方式来达到分布式-否决式限流的效果。redis执行lua脚本是一个单线程的行为，所以不需要显示加锁，这可以说避免了加锁导致的线程切换开销。

## 锁的演变

下面记录一下这个设计的演变过程。


 - 单体式应用中显示加锁
  首先还是回到单体应用中对共享变量进行+1的例子。
```java
	Integer count = 0;

	//sychronized锁
	public synchronized void synchronizedIncrement(){
        count++;
    }

	//juc中的lock
	Lock lock = new ReentrantLock();

    public void incrementByLock(){
        lock.lock();
        try{
            count++;
        }finally {
            lock.unlock();
        }

    }
```
用synchronized或者lock同步的方式进行统计，当单位时间内到达限定次数后否决执行。限制：单体应用下有效，分布式场景失效，显示加锁，开销大。

 - 单体式应用中CAS操作

```java
public AtomicInteger atomicInteger = new AtomicInteger(0);

public increamt(){
	atomicInteger.incrementAndGet();
}
```
虽然没有显示加锁，但是CAS操作有一定的局限性，限流中不仅要对计数器进行+1，而且还要记录时间段，所以复合操作，还是无法避免加锁。

-  分布式应用中显示加锁

```java
RedisDistributeLock lock = new RedisDistributeLock();

public void incrementByLock(){
  lock.lock();
  try{
  	count++;
  }finally {
 	 lock.unlock();
  }

}
```
分布式阻塞锁的实现，可以参考我之前的博客。虽然能达到多个模块之间的同步，但还是开销过大。不得已时才会考虑使用。

-  redis+lua脚本限流（最终方案）

```
local key = KEYS[1] --限流KEY（一秒一个）
local limit = tonumber(ARGV[1])        --限流大小
local current = tonumber(redis.call('get', key) or "0")
if current + 1 > limit then --如果超出限流大小
    redis.call("INCRBY", key,"1") -- 如果不需要统计真是访问量可以不加这行
    return 0
else  --请求数+1，并设置2秒过期
    redis.call("INCRBY", key,"1")
    if tonumber(ARGV[2]) > -1 then
        redis.call("expire", key,tonumber(ARGV[2])) --时间窗口最大时间后销毁键
    end
    return 1
end
```
lua脚本返回值比较奇怪，用java客户端接受返回值，只能使用Long，没有去深究。这个脚本只需要传入key（url+时间戳/预设时间窗口大小），便可以实现限流。
这里也贴下java中配套的工具类

```
package sinosoftgz.apiGateway.utils;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.util.Assert;

import java.util.Arrays;

/**
 * Created by xujingfeng on 2017/3/13.
 * <p>
 * 基于redis lua脚本的线程安全的计数器限流方案
 * </p>
 */
public class RedisRateLimiter {

    /**
     * 限流访问的url
     */
    private String url;

    /**
     * 单位时间的大小,最大值为 Long.MAX_VALUE - 1,以秒为单位
     */
    final Long timeUnit;

    /**
     * 单位时间窗口内允许的访问次数
     */
    final Integer limit;

    /**
     * 需要传入一个lua script,莫名其妙redisTemplate返回值永远是个Long
     */
    private RedisScript<Long> redisScript;

    private RedisTemplate redisTemplate;

    /**
     * 配置键是否会过期，
     * true：可以用来做接口流量统计，用定时器去删除
     * false：过期自动删除，时间窗口过小的话会导致键过多
     */
    private boolean isDurable = false;

    public void setRedisScript(RedisScript<Long> redisScript) {
        this.redisScript = redisScript;
    }

    public void setRedisTemplate(RedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public boolean isDurable() {
        return isDurable;
    }

    public void setDurable(boolean durable) {
        isDurable = durable;
    }

    public RedisRateLimiter(Integer limit, Long timeUnit) {
        this.timeUnit = timeUnit;
        Assert.isTrue(timeUnit < Long.MAX_VALUE - 1);
        this.limit = limit;
    }

    public RedisRateLimiter(Integer limit, Long timeUnit, boolean isDurable) {
        this(limit, timeUnit);
        this.isDurable = isDurable;
    }

    public boolean acquire() {
        return this.acquire(this.url);
    }

    public boolean acquire(String url) {
        StringBuffer key = new StringBuffer();
        key.append("rateLimiter").append(":")
                .append(url).append(":")
                .append(System.currentTimeMillis() / 1000 / timeUnit);
        Integer expire = limit + 1;
        String convertExpire = isDurable ? "-1" : expire.toString();
        return redisTemplate.execute(redisScript, Arrays.asList(key.toString()), limit.toString(), convertExpire).equals(1l);
    }

}

```
由此可以见，分布式场景下，一个小小的统计次数的需求，如果真想在分布式下做到最完善，需要花很大的精力。



