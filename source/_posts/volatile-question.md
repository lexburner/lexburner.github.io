---
title:	volatile 疑问记录
date: 2017-03-07 19:26:52
tags: 
- 多线程
- JAVA
categories: 
- JAVA
---



对 java 中 volatile 关键字的描述，主要是 ** 可见性 ** 和 ** 有序性 ** 两方面。

一个很广泛的应用就是使得多个线程对共享资源的改动变得互相可见，如下：

```java
public class TestVolatile extends Thread {
    /*A*/
//    public volatile boolean runFlag = true;
    public boolean runFlag = true;

    public boolean isRunFlag() {
        return runFlag;
    }

    public void setRunFlag(boolean runFlag) {
        this.runFlag = runFlag;
    }

    @Override
    public void run() {
        System.out.println("进入 run");
        while (isRunFlag()) {
            /*B*/
//            System.out.println("running");
        }
        System.out.println("退出 run");
    }

    public static void main(String[] args) throws InterruptedException {
        TestVolatile testVolatile = new TestVolatile();
        testVolatile.start();
        try {
            Thread.sleep(500);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        testVolatile.setRunFlag(false);
        System.out.println("main already set runflag to false");
        new CountDownLatch(1).await();
    }
}
```
在 A 处如果不将运行标记（runflag）设置成 volatile，那么 main 线程对 runflag 的修改对于 testVolatile 线程将不可见。导致其一直不打印“退出 run”这句。

但是如果在 testVolatile 线程的 while() 增加一句：B 处打印语句，程序却达到了不使用 volatile，修改也变得可见，不知道到底是什么原理。

只能大概估计是 while() 的执行过程中线程上下文进行了切换，使得重新去主存获取了 runflag 的最新值，从而退出了循环，暂时记录...

2017/3/8 日更新
和群里面的朋友讨论了一下，发现同一份代码，不同的机器运行出了不一样的效果。又仔细翻阅了一下《effective java》，依稀记得当时好像遇到过这个问题，果然，在并发的第一张就对这个现象做出了解释。
关键就在于 HotSpot Server VM 对编译进行了优化，这种优化称之为 * 提升 *(hoisting)，结果导致了 * 活性失败 *（liveness failure）

```java
while (isRunFlag()) {}
```
会被优化成

```java
if(isRunFlag()){
	while(true)...
}
```
引用 effective java 这一节的原话：
> 简而言之，当多个线程共享可变数据的时候，每个读或者写数据的线程都必须执行同步
> 如果没有同步，就无法保证一个线程所做的修改可以被另一个线程获知。未能同步共享可变数据会造成程序的活性失败和安全性失败。这样的失败是难以调式的。他们可能是间歇性的，且与时间相关，程序的行为在不同的 VM 上可能根本不同，如果只需要线程之间的交互通信，而不需要互斥，volatile 修饰符就是一种可以接受的同步形式，但是正确的使用它可能需要一些技巧。




