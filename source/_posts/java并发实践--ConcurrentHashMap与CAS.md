---
title:  java并发实践--ConcurrentHashMap与CAS
date: 2017-03-12 00:02:00
tags: 
- JAVA
- 多线程
categories: 
- JAVA
---

## 前言

最近在做接口限流时涉及到了一个有意思问题，牵扯出了关于concurrentHashMap的一些用法，以及CAS的一些概念。限流算法很多，我主要就以最简单的计数器法来做引。先抽象化一下需求：统计每个接口访问的次数。一个接口对应一个url，也就是一个字符串，每调用一次对其进行加一处理。可能出现的问题主要有三个：

  1. 多线程访问，需要选择合适的并发容器
  2. 分布式下多个实例统计接口流量需要共享内存
  3. 流量统计应该尽可能不损耗服务器性能

但这次的博客并不是想描述怎么去实现接口限流，而是主要想描述一下遇到的问题，所以，第二点暂时不考虑，即不使用redis。

说到并发的字符串统计，立即让人联想到的数据结构便是`ConcurrentHashpMap<String,Long> urlCounter;`

<!-- more -->

如果你刚刚接触并发可能会写出如代码清单1的代码

## 代码清单1

```JAVA
public class CounterDemo1 {

    private final Map<String, Long> urlCounter = new ConcurrentHashMap<>();

	//接口调用次数+1
    public long increase(String url) {
        Long oldValue = urlCounter.get(url);
        Long newValue = (oldValue == null) ? 1L : oldValue + 1;
        urlCounter.put(url, newValue);
        return newValue;
    }

	//获取调用次数
    public Long getCount(String url){
        return urlCounter.get(url);
    }

    public static void main(String[] args) {
        ExecutorService executor = Executors.newFixedThreadPool(10);
        final CounterDemo1 counterDemo = new CounterDemo1();
        int callTime = 100000;
        final String url = "http://localhost:8080/hello";
        CountDownLatch countDownLatch = new CountDownLatch(callTime);
        //模拟并发情况下的接口调用统计
        for(int i=0;i<callTime;i++){
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    counterDemo.increase(url);
                    countDownLatch.countDown();
                }
            });
        }
        try {
            countDownLatch.await();
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        executor.shutdown();
        //等待所有线程统计完成后输出调用次数
        System.out.println("调用次数："+counterDemo.getCount(url));
    }
}

console output：
调用次数：96526
```
都说concurrentHashMap是个线程安全的并发容器，所以没有显示加同步，实际效果呢并不如所愿。

问题就出在increase方法，concurrentHashMap能保证的是每一个操作（put，get,delete...）本身是线程安全的，但是我们的increase方法，对concurrentHashMap的操作是一个组合，先get再put，所以多个线程的操作出现了覆盖。如果对整个increase方法加锁，那么又违背了我们使用并发容器的初衷，因为锁的开销很大。我们有没有方法改善统计方法呢？
代码清单2罗列了concurrentHashMap父接口concurrentMap的一个非常有用但是又常常被忽略的方法。

## 代码清单2

```JAVA
	/**
     * Replaces the entry for a key only if currently mapped to a given value.
     * This is equivalent to
     *  <pre> {@code
     * if (map.containsKey(key) && Objects.equals(map.get(key), oldValue)) {
     *   map.put(key, newValue);
     *   return true;
     * } else
     *   return false;
     * }</pre>
     *
     * except that the action is performed atomically.
     */
    boolean replace(K key, V oldValue, V newValue);
```
这其实就是一个最典型的CAS操作，`except that the action is performed atomically.`这句话真是帮了大忙，我们可以保证比较和设置是一个原子操作，当A线程尝试在increase时，旧值被修改的话就回导致replace失效，而我们只需要用一个循环，不断获取最新值，直到成功replace一次，即可完成统计。

改进后的increase方法如下

## 代码清单3

```java
public long increase2(String url) {
    Long oldValue, newValue;
    while (true) {
      oldValue = urlCounter.get(url);
      if (oldValue == null) {
        newValue = 1l;
        //初始化成功，退出循环
        if (urlCounter.putIfAbsent(url, 1l) == null)
          break;
        //如果初始化失败，说明其他线程已经初始化过了
      } else {
        newValue = oldValue + 1;
        //+1成功，退出循环
        if (urlCounter.replace(url, oldValue, newValue))
          break;
        //如果+1失败，说明其他线程已经修改过了旧值
      }
    }
    return newValue;
}

console output：
调用次数：100000
```
再次调用后获得了正确的结果，上述方案看上去比较繁琐，因为第一次调用时需要进行一次初始化，所以多了一个判断，也用到了另一个CAS操作putIfAbsent，他的源代码描述如下：

## 代码清单4

```java
/**
     * If the specified key is not already associated
     * with a value, associate it with the given value.
     * This is equivalent to
     *  <pre> {@code
     * if (!map.containsKey(key))
     *   return map.put(key, value);
     * else
     *   return map.get(key);
     * }</pre>
     *
     * except that the action is performed atomically.
     *
     * @implNote This implementation intentionally re-abstracts the
     * inappropriate default provided in {@code Map}.
     *
     * @param key key with which the specified value is to be associated
     * @param value value to be associated with the specified key
     * @return the previous value associated with the specified key, or
     *         {@code null} if there was no mapping for the key.
     *         (A {@code null} return can also indicate that the map
     *         previously associated {@code null} with the key,
     *         if the implementation supports null values.)
     */
     V putIfAbsent(K key, V value);
```
简单翻译如下：“如果（调用该方法时）key-value 已经存在，则返回那个 value 值。如果调用时 map 里没有找到 key 的 mapping，返回一个 null 值”。值得注意点的一点就是concurrentHashMap的value是不能存在null值的。实际上呢，上述的方案也可以把Long替换成AtomicLong，可以简化实现， ConcurrentHashMap<String,AtomicLong>。

juc包下的各类Atomic类也提供了大量的CAS操作，可以不用加锁，也可以实现原子操作，以后看到其他类库有类似比较后设值，不存在即设值，加一并获取返回值等等一系列的组合操作合并成了一个接口的，都应该意识到很有可能是CAS操作。如redis的IncreamtAndGet，setIfAbsent，Atomic类的一系列api，以及上述描述的concurrentHashMap中相关的api（不同api的CAS组合接口可能名称类似，但是返回值含义不大相同，我们使用CAS的api很大程度需要获取其返回值来进行分支处理，所以一定要搞清楚每个接口的特性。如redistemplate提供的setIfAbsent，当设置成功时返回的是true，而与之名称类似的ConcurrentHashMap的putIfAbsent在设置成功后返回的是null，要足够小心，加以区分）。凡事没有绝对，但是一个大体上正确的编程建议便是**能使用编程类库并发容器（线程安全的类）完成的操作，尽量不要显示加锁同步**。

再扯一句关于CAS的知识点，CAS不能代替同步，由它引出了一个经典的ABA问题，即修改过一次之后，第二次修改又变为了原值，可能会在一些逻辑中出现问题。不过对于计数这个逻辑而言，只是单调的增，不会受到影响。

最后介绍一个和主题非常贴切的并发容器：Guava包中AtomicLongMap，使用他来做计数器非常容易。

## 代码清单5

```java
private AtomicLongMap<String> urlCounter3 = AtomicLongMap.create();

public long increase3(String url) {
  long newValue = urlCounter3.incrementAndGet(url);
  return newValue;
}


public Long getCount3(String url) {
  return urlCounter3.get(url);
}
```
看一下他的源码就会发现，其实和代码清单3思路差不多，只不过功能更完善了一点。

和CAS很像的操作，我之前的博客中提到过数据库的乐观锁，用version字段来进行并发控制，其实也是一种compare and swap的思想。

杂谈：网上很多对ConcurrentHashMap的介绍，众所周知，这是一个用分段锁实现的一个线程安全的map容器，但是真正对他的使用场景有介绍的少之又少。面试中能知道这个容器的人也确实不少，问出去，也就回答一个分段锁就没有下文了，但我觉得吧，有时候一知半解反而会比不知道更可怕。

## 参考

1. https://my.oschina.net/mononite/blog/144329
2. http://www.tuicool.com/articles/zuui6z



