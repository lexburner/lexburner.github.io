---
title: 浅析项目中的并发(二)
date: 2017-10-15 11:11:11
tags:
- 架构设计
categories:
- 架构设计
---

## 分布式遭遇并发

在前面的章节，并发操作要么发生在单个应用内，一般使用基于JVM的lock解决并发问题，要么发生在数据库，可以考虑使用数据库层面的锁，而在分布式场景下，需要保证多个应用实例都能够执行同步代码，则需要做一些额外的工作，一个最典型分布式同步方案便是使用分布式锁。

分布式锁由很多种实现，但本质上都是类似的，即依赖于共享组件实现锁的询问和获取，如果说单体式应用中的Monitor是由JVM提供的，那么分布式下Monitor便是由共享组件提供，而典型的共享组件大家其实并不陌生，包括但不限于：Mysql，Redis，Zookeeper。同时他们也代表了三种类型的共享组件：数据库，缓存，分布式协调组件。基于Consul的分布式锁，其实和基于Zookeeper的分布式锁大同小异，都是借助于分布式协调组件实现锁，大而化之，这三种类型的分布式锁，原理也都差不多，只不过，锁的特性和实现细节有所差异。

### Redis实现分布式锁

定义需求：A应用需要完成添加库存的操作，部署了A1，A2，A3多个实例，实例之间的操作要保证同步。

分析需求：显然，此时依赖于JVM的lock已经没办法解决问题了，A1添加锁，无法保证A2，A3的同步，这种场景可以考虑使用分布式锁应对。

建立一张Stock表，包含id，number两个字段，分别让A1，A2，A3并发对其操作，保证线程安全。

```java
@Entity
public class Stock {
    @Id
    private String id;
    private Integer number;
}
```

定义数据库访问层：

```java
public interface StockRepository extends JpaRepository<Stock,String> {
}
```

这一节的主角，redis分布式锁，使用开源的redis分布式锁实现：Redisson。

引入Redisson依赖：

```xml
<dependency>
    <groupId>org.redisson</groupId>
    <artifactId>redisson</artifactId>
    <version>3.5.4</version>
</dependency>
```

定义测试类：

```java
@RestController
public class StockController {

    @Autowired
    StockRepository stockRepository;

    ExecutorService executorService = Executors.newFixedThreadPool(10);

    @Autowired
    RedissonClient redissonClient;

    final static String id = "1";

    @RequestMapping("/addStock")
    public void addStock() {
        RLock lock = redissonClient.getLock("redisson:lock:stock:" + id);
        for (int i = 0; i < 100; i++) {
            executorService.execute(() -> {
                lock.lock();
                try {
                    Stock stock = stockRepository.findOne(id);
                    stock.setNumber(stock.getNumber() + 1);
                    stockRepository.save(stock);
                } finally {
                    lock.unlock();
                }
            });
        }
    }

}
```

 上述的代码使得并发发生在多个层面。其一，在应用内部，启用线程池完成库存的加1操作，本身便是线程不安全的，其二，在多个应用之间，这样的加1操作更加是不受约束的。若初始化id为1的Stock数量为0。分别在本地启用A1(8080)，A2(8081)，A3(8082)三个应用，同时并发执行一次addStock()，若线程安全，必然可以使得数据库中的Stock为300，这便是我们的检测依据。

简单解读下上述的代码，使用redisson获取一把RLock，RLock是`java.util.concurrent.locks.Lock`接口的实现类，Redisson帮助我们屏蔽Redis分布式锁的实现细节，使用过`java.util.concurrent.locks.Lock`的朋友都会知道下述的代码可以被称得上是同步的起手范式，毕竟这是Lock的java doc中给出的代码：

```java
Lock l = ...;
l.lock();
try {
   // access the resource protected by this lock
} finally {
  l.unlock();
}
```

而`redissonClient.getLock("redisson:lock:stock:" + id)`则是以`"redisson:lock:stock:" + id`该字符串作痛同步的Monitor，保证了不同id之间是互相不阻塞的。

为了保证发生并发，实际测试中我加入了Thread.sleep(1000)，使竞争得以发生。测试结果：

![测试结果](http://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720171015115902.png)

Redis分布式锁的确起了作用。

## 锁的注意点

如果仅仅是实现一个能够用于demo的Redis分布式锁并不难，但为何大家更偏向于使用开源的实现呢？主要还是可用性和稳定性，we make things work是我在写博客，写代码时牢记在脑海中的，如果真的要细究如何自己实现一个分布式锁，或者平时使用锁保证并发，需要有哪些注意点呢？列举几点：阻塞，超时时间，可重入，可用性，其他特性。

### 阻塞

意味着各个操作之间的等待，A1正在执行增加库存时，A1其他的线程被阻塞，A2，A3中所有的线程被阻塞，在Redis中可以使用轮询策略以及redis底层提供的CAS原语(如setnx)来实现。（初学者可以理解为：在redis中设置一个key，想要执行lock代码时先询问是否有该key，如果有则代表其他线程在执行过程中，若没有，则设置该key，并且执行代码，执行完毕，释放key，而setnx保证操作的原子性）

### 超时时间

在特殊情况，可能会导致锁无法被释放，如死锁，死循环等等意料之外的情况，锁超时时间的设置是有必要的，一个很直观的想法是给key设置过期时间即可。

如在Redisson中，lock提供了一个重载方法`lock(long t, TimeUnit timeUnit);`可以自定义过期时间。

### 可重入

这个特性很容易被忽视，可重入其实并不难理解，顾名思义，一个方法在调用过程中是否可以被再次调用。实现可重入需要满足三个特性：

1. 可以在执行的过程中可以被打断；
2. 被打断之后，在该函数一次调用执行完之前，可以再次被调用（或进入，reentered)。
3. 再次调用执行完之后，被打断的上次调用可以继续恢复执行，并正确执行。

比如下述的代码引用了全局变量，便是不可重入的：

```java
int t;

void swap(int x, int y) {
    t = x;
    x = y;
    y = t;
    System.out.println("x is" + x + " y is " + y);
}
```

一个更加直观的例子便是，同一个线程中，某个方法的递归调用不应该被阻塞，所以如果要实现这个特性，简单的使用某个key作为Monitor是欠妥的，可以加入线程编号，来保证可重入。

使用可重入分布式锁的来测试计算斐波那契数列（只是为了验证可重入性）：

```java
    @RequestMapping("testReentrant")
    public void ReentrantLock() {
        RLock lock = redissonClient.getLock("fibonacci");
        lock.lock();
        try {
            int result = fibonacci(10);
            System.out.println(result);
        } finally {
            lock.unlock();
        }
    }

    int fibonacci(int n) {
        RLock lock = redissonClient.getLock("fibonacci");
        try {
            if (n <= 1) return n;
            else
                return fibonacci(n - 1) + fibonacci(n - 2);
        } finally {
            lock.unlock();
        }
    }
```

最终输出：55，可以发现，只要是在同一线程之内，无论是递归调用还是外部加锁(同一把锁)，都不会造成死锁。

### 可用性

借助于第三方中间件实现的分布式锁，都有这个问题，中间件挂了，会导致锁不可用，所以需要保证锁的高可用，这就需要保证中间件的可用性，如redis可以使用哨兵+集群，保证了中间件的可用性，便保证了锁的可用性、

### 其他特性

除了可重入锁，锁的分类还有很多，在分布式下也同样可以实现，包括但不限于：公平锁，联锁，信号量，读写锁。Redisson也都提供了相关的实现类，其他的特性如并发容器等可以参考官方文档。

## 新手遭遇并发

基本算是把项目中遇到的并发过了一遍了，案例其实很多，再简单罗列下一些新手可能会遇到的问题。

使用了线程安全的容器就是线程安全了吗？很多新手误以为使用了并发容器如：concurrentHashMap就万事大吉了，却不知道，一知半解的隐患可能比全然不懂更大。来看下面的代码：

```java
public class ConcurrentHashMapTest {

    static Map<String, Integer> counter = new ConcurrentHashMap();

    public static void main(String[] args) throws InterruptedException {
        counter.put("stock1", 0);
        ExecutorService executorService = Executors.newFixedThreadPool(10);
        CountDownLatch countDownLatch = new CountDownLatch(100);
        for (int i = 0; i < 100; i++) {
            executorService.execute(new Runnable() {
                @Override
                public void run() {
                    counter.put("stock1", counter.get("stock1") + 1);
                    countDownLatch.countDown();
                }
            });
        }
        countDownLatch.await();
        System.out.println("result is " + counter.get("stock1"));
    }
}
```

`counter.put("stock1", counter.get("stock1") + 1)`并不是原子操作，并发容器保证的是单步操作的线程安全特性，这一点往往初级程序员特别容易忽视。

## 总结

项目中的并发场景是非常多的，而根据场景不同，同一个场景下的业务需求不同，以及数据量，访问量的不同，都会影响到锁的使用，架构中经常被提到的一句话是：业务决定架构，放到并发中也同样适用：业务决定控制并发的手段，如本文未涉及的队列的使用，本质上是化并发为串行，也解决了并发问题，都是控制的手段。了解锁的使用很简单，但如果使用，在什么场景下使用什么样的锁，这才是价值所在。

同一个线程之间的递归调用不应该被阻塞，所以如果要实现这个特性，简单的使用某个key作为Monitor是欠妥的，可以加入线程编号，来保证可重入。