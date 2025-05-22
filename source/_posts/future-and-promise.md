---
title: JAVA 拾遗 --Future 模式与 Promise 模式
date: 2018-03-28 18:22:14
tags:
- JAVA
categories:
- JAVA
toc: true
---

写这篇文章的动机，是缘起于微信闲聊群的一场讨论，粗略整理下，主要涉及了以下几个具体的问题：
<!-- more -->
1. 同步，异步，阻塞，非阻塞的关联及区别。
2. JAVA 中有 callback 调用吗？
3. jdk 包中的 Future 怎么用？
4. Future 模式和 Promise 模式是包含的关系，还是交集的关系，还是没有关系？

带着上面这些疑问，来看看我到底要拾遗些啥。

## 浅析同步，异步，阻塞，非阻塞

这几个概念一直困扰着我，说实话我现在依旧不能从一个很深的层次去和一个小白解释，这几个概念到底有什么区别。本节我不掺杂自己的描述，主要列出几个我学习过程中认为不错的点，分享给大家，以供诸位理解。

翻看知乎高赞答案，[『怎样理解阻塞非阻塞与同步异步的区别？』](https://www.zhihu.com/question/19732473/answer/20851256) 文章从『消息通信机制』和『程序在等待调用结果时的状态』两个方面来区分这两组概念，并举例说明了理解他们的方式。但我相信很多人会有跟我一样的感觉，例子看的时候都觉得自己懂了，但要从理论上的层面去解释，又会觉得词穷。以至于一探讨到这四个概念，大家都开始了举例子大会。

正确理解这四个概念，有很多前置条件，比如得框定上下文，Linux 中的 network IO 具有“同步，异步，阻塞，非阻塞”这些概念，而 JAVA 相关框架以及原生 jdk 也涉及这些概念（比如 socket，netty），他们具有很多的相似性，但概念又不尽相同，这也是导致这几个概念难以被理解的原因。从 Linux 层面来理解这几个概念的区别，我也找到一篇不错的文章：[『IO - 同步，异步，阻塞，非阻塞 （亡羊补牢篇）』](https://blog.csdn.net/historyasamirror/article/details/5778378)

如果想要从 JAVA 的角度来理解这四个概念，就必须对 IO 模型有所了解，首先明晰如下的概念：Java 对于 IO 的封装分为 BIO、NIO 和 AIO。Java 目前并不支持异步 IO，BIO 对应的是阻塞同步 IO，NIO 和 AIO 对应的都是非阻塞同步 IO。特别是最后一点有不少文章会曲解，认为 AIO 是异步 IO。细致的讲解可以参考张亮大神的这篇文章：https://mp.weixin.qq.com/s/uDgueoMIEjl-HCE_fcSmSw

## 同步调用模式

我个人认为，一味地想要搞清楚上述这四个知识点，对我们理解方法调用模式并不会有太大帮助。我们来看看下面的这个比较简单的例子。

```Java
public class SyncDemo {
    public static void main(String[] args) throws InterruptedException {
        long l = System.currentTimeMillis();
        int i = syncCalculate();
        System.out.println("计算结果:" + i);
        System.out.println("主线程运算耗时:" + (System.currentTimeMillis() - l)+ "ms");
    }

    // 最常用的同步调用
    static int syncCalculate() {
        System.out.println("执行耗时操作...");
        timeConsumingOperation();
        return 100;
    }

    static void timeConsumingOperation() {
        try {
            Thread.sleep(3000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

控制台输出：

```
执行耗时操作... 计算结果:100 主线程运算耗时:3000 ms
```

同步调用模式是我们最最最常用的方式，如果是业务开发，几乎 99% 的方法是同步方法。再回到一开始的纠结点：是同步调用还是异步调用，毫无疑问是同步调用；是阻塞还是非阻塞？其实压根就不涉及到这个问题，说是阻塞也没毛病，syncCalculate 方法阻塞了主线程，但我们通常不会讨论这里是阻塞还是非阻塞。

## Future 模式

上述的例子是较为简单的引子，本节将会介绍 JAVA 中的 Future 模式。上述的 syncCalculate 方法是一个耗时的操作，为了优化性能，我们可以考虑使用 Future 模式。Future 模式相当于一个占位符，代表一个操作的未来的结果，其简单的概念不在本文中介绍，直接给出总结：Future 模式可以细分为将来式和回调式两种模式。

**Future 模式 -- 将来式 1**

```Java
public class FutureDemo1 {
    public static void main(String[] args) throws ExecutionException, InterruptedException {
        long l = System.currentTimeMillis();
        ExecutorService executorService = Executors.newSingleThreadExecutor();
        Future<Integer> future = executorService.submit(new Callable<Integer>() {
            @Override
            public Integer call() throws Exception {
                System.out.println("执行耗时操作...");
                timeConsumingOperation();
                return 100;
            }
        }); //<1>
        // 其他耗时操作..<3>
        System.out.println("计算结果:" + future.get());//<2>
        System.out.println("主线程运算耗时:" + (System.currentTimeMillis() - l)+ "ms");
    }

    static void timeConsumingOperation() {
        try {
            Thread.sleep(3000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

控制台输出：

```
执行耗时操作... 计算结果:100 主线程运算耗时:3007 ms
```

<1> 将回调接口交给线程池去执行，这一步是非阻塞的，返回了一个运算结果的占位符 --future。

<2> 在这一步中我们调用了 future 的 get 方法，那么如果 future 的计算还未完成，主线程将会被这一步阻塞。

<3> 我们观察一下控制台的输出，发现依旧耗费 3s 来完成这次耗时操作，并没有比同步调用方式快。但是提交任务（非阻塞）和获取结果（阻塞）之间我们可以进行一些额外的操作，而这将形成一个并行执行的效果。

我们会发现如果 future 提交给线程池执行之后立刻 get()，其实执行效率并不会变高，反而由于线程的开销会比同步调用更慢。这种将来式的 future 适用多个耗时操作并发执行的场景。

**Future 模式 -- 将来式 2**

除了这个阻塞式的 get() 获取结果，jdk 的 future 还提供了非阻塞式的方式用来获取 future 的结果。查看 jdk 中 Future 的定义：

```Java
public interface Future<V> {
    boolean cancel(boolean mayInterruptIfRunning);

    boolean isCancelled();

    boolean isDone();

    V get() throws InterruptedException, ExecutionException;

    V get(long timeout, TimeUnit unit) throws InterruptedException, ExecutionException, TimeoutException;
}
```

其中可以通过轮询 isDone()方法来达到非阻塞式获取结果的效果。但个人认为与阻塞式的 get() 并没有什么差异，实际项目中也没有需要使用非阻塞式的场景。

**Future 模式 -- 回调式 **

写过前端 ajax 代码的朋友对 callback 的写法并不会陌生，而 Future 模式的第二种用法便是回调。很不幸的事，jdk 实现的 Future 并没有实现 callback,addListener 这样的方法，想要在 JAVA 中体验到 callback 的特性，得引入一些额外的框架。

** 回调式实现一 --Netty**

Netty 除了是一个高性能的网络通信框架之外，还对 jdk 的 Future 做了扩展，翻看其文档 http://netty.io/wiki/using-as-a-generic-library.html#wiki-h2-5 可以发现其扩展了一个 listener 接口。

引入 Netty 的 maven 依赖

```Xml
<dependency>
    <groupId>io.netty</groupId>
    <artifactId>netty-all</artifactId>
    <version>4.1.22.Final</version>
</dependency>
```

```Java
public class NettyFutureDemo {
    public static void main(String[] args) throws InterruptedException {
        long l = System.currentTimeMillis();
        EventExecutorGroup group = new DefaultEventExecutorGroup(4);
        Future<Integer> f = group.submit(new Callable<Integer>() {
            @Override
            public Integer call() throws Exception {
                System.out.println("执行耗时操作...");
                timeConsumingOperation();
                return 100;
            }
        });
        f.addListener(new FutureListener<Object>() {
            @Override
            public void operationComplete(Future<Object> objectFuture) throws Exception {
                System.out.println("计算结果:：" + objectFuture.get());
            }
        });
        System.out.println("主线程运算耗时:" + (System.currentTimeMillis() - l)+ "ms");
        new CountDownLatch(1).await();
    }

    static void timeConsumingOperation() {
        try {
            Thread.sleep(3000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

控制台输出：

```
主线程运算耗时:329 ms 执行耗时操作... 计算结果:：100
```

结果分析：使用了 addListener 这样的方法为一个 future 结果添加回调，从而达到“当耗时操作完成后，自行触发钩子去执行打印操作”的效果。细心的朋友会发现，主线程只耗费了不到 1s 的时间，整个过程没有被耗时操作阻塞，这才是异步编程的推荐方式：回调。

** 回调式实现二 --Guava**

不仅仅 Netty 想到了这一点，google 提供的扩展包 Guava 也为回调式的 Future 提供了实现，其核心接口为

引入 Guava 依赖：

```Xml
<dependency>
	<groupId>com.google.guava</groupId>
    <artifactId>guava</artifactId>
    <version>21.0</version>
</dependency>
```

```Java
public class GuavaFutureDemo {
    public static void main(String[] args) throws InterruptedException {
        long l = System.currentTimeMillis();
        ListeningExecutorService service = MoreExecutors.listeningDecorator(Executors.newSingleThreadExecutor());
        ListenableFuture<Integer> future = service.submit(new Callable<Integer>() {
            public Integer call() throws Exception {
                System.out.println("执行耗时操作...");
                timeConsumingOperation();
                return 100;
            }
        });//<1>
        Futures.addCallback(future, new FutureCallback<Integer>() {
            public void onSuccess(Integer result) {
                System.out.println("计算结果:" + result);
            }

            public void onFailure(Throwable throwable) {
                System.out.println("异步处理失败,e=" + throwable);
            }
        });//<2>
        System.out.println("主线程运算耗时:" + (System.currentTimeMillis() - l)+ "ms");
        new CountDownLatch(1).await();
    }

    static void timeConsumingOperation() {
        try {
            Thread.sleep(3000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

控制台输出：

```
执行耗时操作... 主线程运算耗时:65 ms 计算结果:100
```

结果分析：几乎和 Netty 的异步回调效果一样，在这儿顺便补充一下之前我自己学习时的一个疑惑：我一直会担心一个问题，由于 <1> 处的执行是异步，会不会存在一种特殊情况，即 future 结果已经计算好了，但 <2> 操作添加监听器还未执行完成，会导致接收不到回调。实际上后来翻阅了一些资料，这么写是没问题的，无论是在何时 addListener，都可以接收到异步回调。

## 由 Callback Hell 引出 Promise 模式

同样的如果你对 ES6 有所接触，就不会对 Promise 这个模式感到陌生，如果你对前端不熟悉，也不要紧，我们先来看看回调地狱（Callback Hell）是个什么概念。

回调是一种我们推崇的异步调用方式，但也会遇到问题，也就是回调的嵌套。当需要多个异步回调一起书写时，就会出现下面的代码 (以 js 为例):

```Js
asyncFunc1(opt, (...args1) => { 
  asyncFunc2(opt, (...args2) => {       
    asyncFunc3(opt, (...args3) => {            
      asyncFunc4(opt, (...args4) => {
          // some operation
      });
    });
  });
});
```

虽然在 JAVA 业务代码中很少出现回调的多层嵌套（至少我目前的业务没有接触过），但总归是个问题，这样的代码不易读，嵌套太深修改也麻烦。于是 ES6 提出了 Promise 模式来解决回调地狱的问题。由于我的博客主要还是面向于 JAVA 读者，就不介绍 JavaScript 中的 Promise 用法了。可能就会有人想问：java 中存在 Promise 模式吗？答案是肯定的。

前面提到了 Netty 和 Guava 的扩展都提供了 addListener 这样的接口，用于处理 Callback 调用，但其实 jdk1.8 已经提供了一种更为高级的回调方式：CompletableFuture。首先尝试用 CompletableFuture 来解决回调的问题。

```Java
public class CompletableFutureDemo {
    public static void main(String[] args) throws InterruptedException {
        long l = System.currentTimeMillis();
        CompletableFuture<Integer> completableFuture = CompletableFuture.supplyAsync(() -> {
            System.out.println("执行耗时操作...");
            timeConsumingOperation();
            return 100;
        });
        completableFuture.whenComplete((result, e) -> {
            System.out.println("结果：" + result);
        });
        System.out.println("主线程运算耗时:" + (System.currentTimeMillis() - l)+ "ms");
        new CountDownLatch(1).await();
    }

    static void timeConsumingOperation() {
        try {
            Thread.sleep(3000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

控制台输出：

```
执行耗时操作... 主线程运算耗时:55 ms 结果：100
```

可以发现耗时操作没有占用主线程的时间片，达到了异步调用的效果。我们也不需要引入任何第三方的依赖，这都是依赖于 java.util.concurrent.CompletableFuture 的出现。CompletableFuture 提供了近 50 多个方法，大大便捷了 java 多线程操作，和异步调用的写法。

使用 CompletableFuture 解决回调地狱问题：

```Java
public class CompletableFutureDemo {
    public static void main(String[] args) throws InterruptedException {
        long l = System.currentTimeMillis();
        CompletableFuture<Integer> completableFuture = CompletableFuture.supplyAsync(() -> {
            System.out.println("在回调中执行耗时操作...");
            timeConsumingOperation();
            return 100;
        });
        completableFuture = completableFuture.thenCompose(i -> {
            return CompletableFuture.supplyAsync(() -> {
                System.out.println("在回调的回调中执行耗时操作...");
                timeConsumingOperation();
                return i + 100;
            });
        });//<1>
        completableFuture.whenComplete((result, e) -> {
            System.out.println("计算结果:" + result);
        });
        System.out.println("主线程运算耗时:" + (System.currentTimeMillis() - l)+ "ms");
        new CountDownLatch(1).await();
    }

    static void timeConsumingOperation() {
        try {
            Thread.sleep(3000);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

控制台输出：

```
在回调中执行耗时操作... 主线程运算耗时:63 ms 在回调的回调中执行耗时操作... 计算结果:200
```

<1> 使用 thenCompose 或者 thenComposeAsync 等方法可以实现回调的回调，且写出来的方法易于维护。

## 总结

同步，异步，阻塞，非阻塞的理解需要花费很大的精力，从 IO 模型和内核进行深入地理解，才能分清区别。在日常开发中往往没必要过于纠结到底是何种调用，但得对调用的特性有所了解，比如是否占用主线程的时间片，出现异常怎么捕获，超时怎么解决等等（后面这些本文未介绍）。

Future 有两种模式：将来式和回调式。而回调式会出现回调地狱的问题，由此衍生出了 Promise 模式来解决这个问题。这才是 Future 模式和 Promise 模式的相关性。

** 欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](https://image.cnkirito.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)
