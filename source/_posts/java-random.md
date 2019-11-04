---
title: Java 随机数探秘
date: 2018-09-12 19:47:28
tags:
- JAVA
categories:
- JAVA 并发合集
---

> 本文的前 3 节参考修改自微信公众号「咖啡拿铁」的文章，感谢李钊同学对这个话题热情的讨论。

### 1 前言

一提到 Java 中的随机数，很多人就会想到 `Random`，当出现生成随机数这样需求时，大多数人都会选择使用 Random 来生成随机数。Random 类是线程安全的，但其内部使用 CAS 来保证线程安全性，在多线程并发的情况下的时候它的表现是存在优化空间的。在 JDK1.7 之后，Java 提供了更好的解决方案 ThreadLocalRandom，接下来，我们一起探讨下这几个随机数生成器的实现到底有何不同。

### 2 Random

Random 这个类是 JDK 提供的用来生成随机数的一个类，这个类并不是真正的随机，而是伪随机，伪随机的意思是生成的随机数其实是有一定规律的，而这个规律出现的周期随着伪随机算法的优劣而不同，一般来说周期比较长，但是可以预测。通过下面的代码我们可以对 Random 进行简单的使用: 

![img](http://kirito.iocoder.cn/648.jpeg)

#### Random 原理

Random 中的方法比较多，这里就针对比较常见的 nextInt()和 nextInt(int bound) 方法进行分析，前者会计算出 int 范围内的随机数，后者如果我们传入 10，那么他会求出 [0,10) 之间的 int 类型的随机数，左闭右开。我们首先看一下 Random() 的构造方法:

 ![img](http://kirito.iocoder.cn/20190906173929.jpg)

可以发现在构造方法当中，根据当前时间的种子生成了一个 AtomicLong 类型的 seed，这也是我们后续的关键所在。

### nextInt()

nextInt() 的代码如下所示：

 ![img](http://kirito.iocoder.cn/642.png)

这个里面直接调用的是 next() 方法，传入的 32，代指的是 Int 类型的位数。

![img](http://kirito.iocoder.cn/643.jpeg)

这里会根据 seed 当前的值，通过一定的规则 (伪随机算法) 算出下一个 seed，然后进行 CAS，如果 CAS 失败则继续循环上面的操作。最后根据我们需要的 bit 位数来进行返回。核心便是 CAS 算法。

### nextInt(int bound)

nextInt(int bound) 的代码如下所示：![img](http://kirito.iocoder.cn/644.jpeg)

这个流程比 nextInt() 多了几步，具体步骤如下:

1. 首先获取 31 位的随机数，注意这里是 31 位，和上面 32 位不同，因为在 nextInt()方法中可以获取到随机数可能是负数，而 nextInt(int bound) 规定只能获取到 [0,bound) 之前的随机数，也就意味着必须是正数，预留一位符号位，所以只获取了 31 位。(不要想着使用取绝对值这样操作，会导致性能下降)
2. 然后进行取 bound 操作。
3. 如果 bound 是 2 的幂次方，可以直接将第一步获取的值乘以 bound 然后右移 31 位，解释一下: 如果 bound 是 4，那么乘以 4 其实就是左移 2 位，其实就是变成了 33 位，再右移 31 位的话，就又会变成 2 位，最后，2 位 int 的范围其实就是 [0,4) 了。
4. 如果不是 2 的幂，通过模运算进行处理。

#### 并发瓶颈

在我之前的文章中就有相关的介绍，一般而言，CAS 相比加锁有一定的优势，但并不一定意味着高效。一个立刻被想到的解决方案是每次使用 Random 时都去 new 一个新的线程私有化的 Random 对象，或者使用 ThreadLocal 来维护线程私有化对象，但除此之外还存在更高效的方案，下面便来介绍本文的主角 ThreadLocalRandom。

### 3 ThreadLocalRandom

在 JDK1.7 之后提供了新的类 ThreadLocalRandom 用来在并发场景下代替 Random。使用方法比较简单: 

```Java
ThreadLocalRandom.current().nextInt();
ThreadLocalRandom.current().nextInt(10);
```

在 current 方法中有:

![img](http://kirito.iocoder.cn/645.jpeg) 可以看见如果没有初始化会对其进行初始化，而这里我们的 seed 不再是一个全局变量，在我们的 Thread 中有三个变量: 

![img](http://kirito.iocoder.cn/646.jpeg)

- threadLocalRandomSeed：ThreadLocalRandom 使用它来控制随机数种子。
- threadLocalRandomProbe：ThreadLocalRandom 使用它来控制初始化。
- threadLocalRandomSecondarySeed：二级种子。

可以看见所有的变量都加了 @sun.misc.Contended 这个注解，用来处理伪共享问题。

在 nextInt() 方法当中代码如下:

![img](http://kirito.iocoder.cn/647.jpeg)

我们的关键代码如下:

```
UNSAFE.putLong(t = Thread.currentThread(), SEED,r=UNSAFE.getLong(t, SEED) + GAMMA);
```

可以看见由于我们每个线程各自都维护了种子，这个时候并不需要 CAS，直接进行 put，在这里利用线程之间隔离，减少了并发冲突；相比较 `ThreadLocal<Random>`，ThreadLocalRandom 不仅仅减少了对象维护的成本，其内部实现也更轻量级。所以 ThreadLocalRandom 性能很高。

### 4 性能测试

除了文章中详细介绍的 Random，ThreadLocalRandom，我还将 netty4 实现的 ThreadLocalRandom，以及 `ThreadLocal<Random>` 作为参考对象，一起参与 JMH 测评。

```Java
@BenchmarkMode({Mode.AverageTime})
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 3, time = 5)
@Measurement(iterations = 3, time = 5)
@Threads(50)
@Fork(1)
@State(Scope.Benchmark)
public class RandomBenchmark {

    Random random = new Random();

    ThreadLocal<Random> threadLocalRandomHolder = ThreadLocal.withInitial(Random::new);

    @Benchmark
    public int random() {
        return random.nextInt();
    }

    @Benchmark
    public int threadLocalRandom() {
        return ThreadLocalRandom.current().nextInt();
    }

    @Benchmark
    public int threadLocalRandomHolder() {
        return threadLocalRandomHolder.get().nextInt();
    }

    @Benchmark
    public int nettyThreadLocalRandom() {
        return io.netty.util.internal.ThreadLocalRandom.current().nextInt();
    }

    public static void main(String[] args) throws RunnerException {
        Options opt = new OptionsBuilder()
                .include(RandomBenchmark.class.getSimpleName())
                .build();

        new Runner(opt).run();
    }

}
```

测评结果如下：

```
Benchmark                                Mode  Cnt     Score     Error  Units
RandomBenchmark.nettyThreadLocalRandom   avgt    3   192.202 ± 295.897  ns/op
RandomBenchmark.random                   avgt    3  3197.620 ± 380.981  ns/op
RandomBenchmark.threadLocalRandom        avgt    3    90.731 ±  39.098  ns/op
RandomBenchmark.threadLocalRandomHolder  avgt    3   229.502 ± 267.144  ns/op
```

从上图可以发现，JDK1.7 的 `ThreadLocalRandom` 取得了最好的成绩，仅仅需要 90 ns 就可以生成一次随机数，netty 实现的 `ThreadLocalRandom`  以及使用 ThreadLocal 维护 Random 的方式差距不是很大，位列 2、3 位，共享的 Random 变量则效果最差。

可见，在并发场景下，ThreadLocalRandom 可以明显的提升性能。

### 5 注意点

注意，ThreadLocalRandom 切记不要调用 current 方法之后，作为共享变量使用

```Java
public class WrongCase {
    
    ThreadLocalRandom threadLocalRandom = ThreadLocalRandom.current();
    
    public int concurrentNextInt(){
        return threadLocalRandom.nextInt();
    }
    
}
```

这是因为 ThreadLocalRandom.current() 会使用初始化它的线程来填充随机种子，这会带来导致多个线程使用相同的 seed。

```Java
public class Main {

    public static void main(String[] args) {
        ThreadLocalRandom threadLocalRandom = ThreadLocalRandom.current();
        for(int i=0;i<10;i++)
        new Thread(new Runnable() {
            @Override
            public void run() {
                System.out.println(threadLocalRandom.nextInt());
            }
        }).start();

    }
}
```

输出相同的随机数：

```
-1667209487
-1667209487
-1667209487
-1667209487
-1667209487
-1667209487
-1667209487
-1667209487
-1667209487
-1667209487
```

请在确保不同线程获取不同的 seed，最简单的方式便是每次调用都是使用 current()：

```Java
public class RightCase {
    public int concurrentNextInt(){
        return ThreadLocalRandom.current().nextInt();
    }
}
```

### 彩蛋 1

梁飞博客中一句话常常在我脑海中萦绕：魔鬼在细节中。优秀的代码都是一个个小细节堆砌出来，今天介绍的 ThreadLocalRandom 也不例外。

![dubbo](http://kirito.iocoder.cn/image-20180911184147013.png)

在 incubator-dubbo-2.7.0 中，随机负载均衡器的一个小改动便是将 Random 替换为了 ThreadLocalRandom，用于优化并发性能。

### 彩蛋 2

ThreadLocalRandom 的 nextInt(int bound) 方法中，当 bound 不为 2 的幂次方时，使用了一个循环来修改 r 的值，我认为这可能不必要，你觉得呢？

```Java
public int nextInt(int bound) {
    if (bound <= 0)
        throw new IllegalArgumentException(BadBound);
    int r = mix32(nextSeed());
    int m = bound - 1;
    if ((bound & m) == 0) // power of two
        r &= m;
    else { // reject over-represented candidates
        for (int u = r >>> 1;
             u + m - (r = u % bound) < 0;
             u = mix32(nextSeed()) >>> 1)
            ;
    }
    return r;
}
```

** 欢迎关注李钊同学的微信公众号：「咖啡拿铁」**

![咖啡拿铁](http://kirito.iocoder.cn/image-20180911185754582.png)

** 当然，也欢迎关注我的微信公众号：「Kirito 的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)



