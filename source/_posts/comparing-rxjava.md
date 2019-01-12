---
title: 八个层面比较 Java 8, RxJava, Reactor
date: 2018-10-16 01:25:14
tags: 
- RxJava
- Reactor
categories: 响应式编程
type: 3
---

### 前言

这是一篇译文，原文出处 [戳这里](http://alexsderkach.io/comparing-java-8-rxjava-reactor/)。其实很久以前我就看完了这篇文章，只不过个人对响应式编程研究的不够深入，羞于下笔翻译，在加上这类译文加了原创还有争议性，所以一直没有动力。恰逢今天交流群里两个大佬对响应式编程的话题辩得不可开交，趁印象还算深刻，借机把这篇文章翻译一下。说道辩论的点，不妨也在这里抛出来：

> 响应式编程在单机环境下是否鸡肋？

结论是：没有结论，我觉得只能抱着怀疑的眼光审视这个问题了。另外还聊到了 RSocket 这个最近在 SpringOne 大会上比较火爆的响应式"新“网络协议，github 地址[戳这里](https://github.com/rsocket/rsocket)，为什么给”新“字打了个引号，仔细观察下 RSocket 的 commit log，其实三年前就有了。有兴趣的同学自行翻阅，说不定就是今年这最后两三个月的热点技术哦。

 Java 圈子有一个怪事，那就是对 RxJava，Reactor，WebFlux 这些响应式编程的名词、框架永远处于渴望了解，感到新鲜，却又不甚了解，使用贫乏的状态。之前转载小马哥的那篇《Reactive Programming 一种技术，各自表述》时，就已经聊过这个关于名词之争的话题了，今天群里的讨论更是加深了我的映像。Java 圈子里面很多朋友一直对响应式编程处于一个了解名词，知道基本原理，而不是深度用户的状态(我也是之一)。可能真的和圈子有关，按石冲兄的说法，其实 Scala 圈子里面的那帮人，不知道比咱们高到哪里去了（就响应式编程而言）。

实在是好久没发文章了，向大家说声抱歉，以后的更新频率肯定是没有以前那么勤了（说的好像以前很勤快似的），一部分原因是在公司内网写的文章没法贴到公众号中和大家分享讨论，另一部分是目前我也处于学习公司内部框架的阶段，不太方便提炼成文章，最后，最大的一部分原因还是我这段时间需要学(tou)习(lan)其(da)他(you)东(xi)西啦。好了，废话也说完了，下面是译文的正文部分。

<!-- more -->

### 引言

关于响应式编程(Reactive Programming)，你可能有过这样的疑问：我们已经有了 Java8 的 Stream, CompletableFuture, 以及 Optional，为什么还必要存在 RxJava 和 Reactor？

回答这个问题并不难，如果在响应式编程中处理的问题非常简单，你的确不需要那些第三方类库的支持。 但随着复杂问题的出现，你写出了一堆难看的代码。然后这些代码变得越来越复杂，难以维护，而 RxJava 和 Reactor 具有许多方便的功能，可以解决你当下问题，并保障了未来一些可预见的需求。本文从响应式编程模型中抽象出了8个标准，这将有助于我们理解标准特性与这些库之间的区别：

1. Composable（可组合）
2. Lazy（惰性执行）
3. Reusable（可复用）
4. Asynchronous（异步）
5. Cacheable（可缓存）
6. Push or Pull（推拉模型）
7. Backpressure（回压）(译者注：按照石冲老哥的建议，这个词应当翻译成"回压"而不是"背压")
8. Operator fusion（操作融合）

我们将会对以下这些类进行这些特性的对比：

1. CompletableFuture（Java 8）
2. Stream（Java 8）
3. Optional（Java 8）
4. Observable (RxJava 1)
5. Observable (RxJava 2)
6. Flowable (RxJava 2)
7. Flux (Reactor Core)

让我们开始吧~



### 1. Composable（可组合）

这些类都是支持 Composable 特性的，使得各位使用者很便利地使用函数式编程的思想去思考问题，这也正是我们拥趸它们的原因。

**CompletableFuture** - 众多的 `.then*()` 方法使得我们可以构建一个 pipeline, 用以传递空值，单一的值，以及异常.

**Stream** - 提供了许多链式操作的编程接口，支持在各个操作之间传递多个值。

**Optional** - 提供了一些中间操作 `.map()`, `.flatMap()`, `.filter()`.

**Observable, Flowable, Flux** - 和 **Stream** 相同

###  2. Lazy（惰性执行）

**CompletableFuture** - 不具备惰性执行的特性，它本质上只是一个异步结果的容器。这些对象的创建是用来表示对应的工作，CompletableFuture 创建时，对应的工作已经开始执行了。但它并不知道任何工作细节，只关心结果。所以，没有办法从上至下执行整个 pipeline。当结果被设置给 CompletableFuture 时，下一个阶段才开始执行。

**Stream** - 所有的中间操作都是延迟执行的。所有的终止操作(terminal operations)，会触发真正的计算(译者注：如 collect() 就是一个终止操作)。

**Optional** - 不具备惰性执行的特性，所有的操作会立刻执行。

**Observable, Flowable, Flux** - 惰性执行，只有当订阅者出现时才会执行，否则不执行。

### 3. Reusable（可复用）

**CompletableFuture** - 可以复用，它仅仅是一个实际值的包装类。但需要注意的是，这个包装是可更改的。`.obtrude*()`方法会修改它的内容，如果你确定没有人会调用到这类方法，那么重用它还是安全的。

**Stream** - 不能复用。Java Doc 注释道：

> A stream should be operated on (invoking an intermediate or terminal stream operation) only once. A stream implementation may throw IllegalStateException if it detects that the stream is being reused. However, since some stream operations may return their receiver rather than a new stream object, it may not be possible to detect reuse in all cases. 

（译者注：Stream 只能被调用一次。如果被校测到流被重复使用了，它会跑出抛出一个 IllegalStateException 异常。但是某些流操作会返回他们的接受者，而不是一个新的流对象，所以无法在所有情况下检测出是否可以重用）

**Optional** - 完全可重用，因为它是不可变对象，而且所有操作都是立刻执行的。

**Observable, Flowable, Flux** - 生而重用，专门设计成如此。当存在订阅者时，每一次执行都会从初始点开始完整地执行一边。

### 4. Asynchronous（异步）

**CompletableFuture** - 这个类的要点在于它异步地把多个操作连接了起来。`CompletableFuture` 代表一项操作，它会跟一个 `Executor` 关联起来。如果不明确指定一个 `Executor`，那么会默认使用公共的 `ForkJoinPool` 线程池来执行。这个线程池可以用 `ForkJoinPool.commonPool()` 获取到。默认设置下它会创建系统硬件支持的线程数一样多的线程（通常和 CPU 的核心数相等，如果你的 CPU 支持超线程(hyperthreading)，那么会设置成两倍的线程数）。不过你也可以使用 JVM 参数指定 ForkJoinPool 线程池的线程数，

```java
-Djava.util.concurrent.ForkJoinPool.common.parallelism=?
```

或者在创建 `CompletableFuture ` 时提供一个指定的 Executor。

**Stream** - 不支持创建异步执行流程，但是可以使用 `stream.parallel()` 等方式创建并行流。

**Optional** - 不支持，它只是一个容器。

**Observable, Flowable, Flux** - 专门设计用以构建异步系统，但默认情况下是同步的。`subscribeOn` 和 `observeOn`允许你来控制订阅以及接收（这个线程会调用 observer 的 `onNext` / `onError` / `onCompleted `方法）。

`subscribeOn ` 方法使得你可以决定由哪个 `Scheduler` 来执行 `Observable.create` 方法。即便你没有调用创建方法，系统内部也会做同样的事情。例如：

```java
Observable
  .fromCallable(() -> {
    log.info("Reading on thread: " + currentThread().getName());
    return readFile("input.txt");
  })
  .map(text -> {
    log.info("Map on thread: " + currentThread().getName());
    return text.length();
  })
  .subscribeOn(Schedulers.io()) // <-- setting scheduler
  .subscribe(value -> {
     log.info("Result on thread: " + currentThread().getName());
  });
```

输出：

```Java
Reading file on thread: RxIoScheduler-2
Map on thread: RxIoScheduler-2
Result on thread: RxIoScheduler-2
```

相反的，`observeOn()` 控制在 `observeOn()` 之后，用哪个 `Scheduler` 来运行下游的执行阶段。例如：

```Java
Observable
  .fromCallable(() -> {
    log.info("Reading on thread: " + currentThread().getName());
    return readFile("input.txt");
  })
  .observeOn(Schedulers.computation()) // <-- setting scheduler
  .map(text -> {
    log.info("Map on thread: " + currentThread().getName());
    return text.length();
  })
  .subscribeOn(Schedulers.io()) // <-- setting scheduler
  .subscribe(value -> {
     log.info("Result on thread: " + currentThread().getName());
  });
```

输出：

```Java
Reading file on thread: RxIoScheduler-2
Map on thread: RxComputationScheduler-1
Result on thread: RxComputationScheduler-1
```

### 5. Cacheable（可缓存）

可缓存和可复用之间的区别是什么？假如我们有 pipeline `A`，重复使用它两次，来创建两个新的 pipeline `B = A + X ` 以及 `C = A + Y`

- 如果 B 和 C 都能成功执行，那么这个 A 就是是可重用的。
- 如果 B 和 C 都能成功执行，并且 A 在这个过程中，整个 pipeline 只执行了一次，那么我们便称 A 是可缓存的。这意味着，可缓存一定代表可重用。

**CompletableFuture** - 跟可重用的答案一样。

**Stream** - 不能缓存中间操作的结果，除非调用了终止操作。

**Optional** - 可缓存，所有操作立刻执行，并且进行了缓存。

**Observable, Flowable, Flux** - 默认不可缓存的，但是可以调用 `.cache()` 把这些类变成可缓存的。例如：

```Java
Observable<Integer> work = Observable.fromCallable(() -> {
  System.out.println("Doing some work");
  return 10;
});
work.subscribe(System.out::println);
work.map(i -> i * 2).subscribe(System.out::println);
```

输出：

```java
Doing some work
10
Doing some work
20
```

使用 `.cache()`：

```Java
Observable<Integer> work = Observable.fromCallable(() -> {
  System.out.println("Doing some work");
  return 10;
}).cache(); // <- apply caching
work.subscribe(System.out::println);
work.map(i -> i * 2).subscribe(System.out::println);
```

输出：

```Java
Doing some work
10
20
```

### 6. Push or Pull（推拉模型）

**Stream 和 Optional** - 拉模型。调用不同的方法（`.get()`, `.collect()` 等）从 pipeline 拉取结果。拉模型通常和阻塞、同步关联，那也是公平的。当调用方法时，线程会一直阻塞，直到有数据到达。

**CompletableFuture, Observable, Flowable, Flux** - 推模型。当订阅一个 pipeline ，并且某些事件被执行后，你会得到通知。推模型通常和非阻塞、异步这些词关联在一起。当 pipeline 在某个线程上执行时，你可以做任何事情。你已经定义了一段待执行的代码，当通知到达的时候，这段代码就会在下个阶段被执行。

### 7. Backpressure（回压）

*支持回压的前提是 pipeline 必须是推模型。*

**Backpressure（回压）** 描述了 pipeline 中的一种场景：某些异步阶段的处理速度跟不上，需要告诉上游生产者放慢速度。直接失败是不能接受的，这会导致大量数据的丢失。

![backpressure.jpg](http://ov0zuistv.bkt.clouddn.com/backpressure.jpg)

**Stream & Optional** - 不支持回压，因为它们是拉模型。

**CompletableFuture** - 不存在这个问题，因为它只产生 0 个或者 1 个结果。

**Observable(RxJava 1), Flowable, Flux** - 支持。常用策略如下：

- Buffering - 缓冲所有的 `onNext` 的值，直到下游消费它们。 

- Drop Recent - 如果下游处理速率跟不上，丢弃最近的 `onNext` 值。
- Use Latest - 如果下游处理速率跟不上，只提供最近的 `onNext` 值，之前的值会被覆盖。

- None - `onNext` 事件直接被触发，不做缓冲和丢弃。
- Exception - 如果下游处理跟不上的话，抛出异常。

**Observable(RxJava 2)** - 不支持。很多 RxJava 1 的使用者用 `Observable` 来处理不适用回压的事件，或者是使用 `Observable` 的时候没有配置任何策略，导致了不可预知的异常。所以，RxJava 2 明确地区分两种情况，提供支持回压的 `Flowable` 和不支持回压的 `Observable`。

### 8. Operator fusion（操作融合）

操作融合的内涵在于，它使得生命周期的不同点上的执行阶段得以改变，从而消除类库的架构因素所造成的系统开销。所有这些优化都在内部被处理完毕，从而让外部用户觉得这一切都是透明的。

只有 RxJava 2 和 Reactor 支持这个特性，但支持的方式不同。总的来说，有两种类型的优化：

**Macro-fusion** - 用一个操作替换 2 个或更多的相继的操作

![macro-fusion_.png](http://ov0zuistv.bkt.clouddn.com/7fec27a062235dff88ef1d56ee2ce483.png)

**Micro-fusion** - 一个输出队列的结束操作，和在一个输入队列的开始操作，能够共享一个队列的实例。比如说，与其调用 `request(1)` 然后处理 onNext()`：

![micro-fusion-1_1.png](http://ov0zuistv.bkt.clouddn.com/6d4b0b357777b8caa2f87283027206ff.png)

不然让订阅者直接从父 `observable` 拉取值。

![micro-fusion-2.png](http://ov0zuistv.bkt.clouddn.com/fac526768bed14d11933464646eb6471.png)

更多信息可以参考 [Part1](http://akarnokd.blogspot.com/2016/03/operator-fusion-part-1.html) 和 [Part2](http://akarnokd.blogspot.com/2016/04/operator-fusion-part-2-final.html)

### 总结

一图胜千言

![2018-04-12_20-38-07.png](http://ov0zuistv.bkt.clouddn.com/5a57f2b1b694cc0f41320763a0cb1c0a.png)

`Stream`，`CompletableFuture` 和 `Optional` 这些类的创建，都是为了解决特定的问题。 并且他们非常适合用于解决这些问题。 如果它们满足你的需求，你可以立马使用它们。

然而，不同的问题具有不同的复杂度，并且某些问题只有新技术才能很好的解决，新技术的出现也是为了解决那些高复杂度的问题。 RxJava 和 Reactor 是通用的工具，它们帮助你以声明方式来解决问题，而不是使用那些不够专业的工具，生搬硬套的使用其他的工具来解决响应式编程的问题，只会让你的解决方案变成一种 hack 行为。



**欢迎关注我的微信公众号：「Kirito的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://ov0zuistv.bkt.clouddn.com/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)