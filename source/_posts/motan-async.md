---
title: Motan中使用异步RPC接口
date: 2017-10-01 22:44:34
tags:
- RPC
- motan
categories:
- RPC
---

这周六参加了一个美团点评的技术沙龙，其中一位老师在介绍他们自研的 RPC 框架时提到一点：RPC 请求分为 sync，future，callback，oneway，并且需要遵循一个原则：能够异步的地方就不要使用同步。正好最近在优化一个业务场景：在一次页面展示中，需要调用 5 个 RPC 接口，导致页面响应很慢。正好启发了我。

## 为什么慢？

大多数开源的 RPC 框架实现远程调用的方式都是同步的，假设 [ 接口1，...，接口5]的每一次调用耗时为 200ms （其中接口2依赖接口1，接口5依赖接口3，接口4），那么总耗时为 1s，这整个是一个串行的过程。

## 多线程加速

第一个想到的解决方案便是多线程，那么[1=>2]编为一组，[[3,4]=>5]编为一组，两组并发执行，[1=>2]串行执行耗时400ms，[3,4]并发执行耗时200ms，[[3,4]=>5]总耗时400ms ，最终[[1=>2],[[3,4]=>5]]总耗时400ms（理论耗时）。相比较于原来的1s，的确快了不少，但实际编写接口花了不少功夫，创建线程池，管理资源，分析依赖关系...总之代码不是很优雅。

RPC中，多线程着重考虑的点是在客户端优化代码，这给客户端带来了一定的复杂性，并且编写并发代码对程序员的要求更高，且不利于调试。

## 异步调用

如果有一种既能保证速度，又能像同步 RPC 调用那样方便，岂不美哉？于是引出了 RPC 中的异步调用。

在 RPC 异步调用之前，先回顾一下 `java.util.concurrent` 中的基础知识：`Callable` 和 `Future`

```java
public class Main {

    public static void main(String[] args) throws Exception{
        
        final ExecutorService executorService = Executors.newFixedThreadPool(10);
        long start = System.currentTimeMillis();
        Future<Integer> resultFuture1 = executorService.submit(new Callable<Integer>() {
            @Override
            public Integer call() throws Exception {
                return method1() + method2();
            }
        });
        Future<Integer> resultFuture2 = executorService.submit(new Callable<Integer>() {
            @Override
            public Integer call() throws Exception {
                Future<Integer> resultFuture3 = executorService.submit(new Callable<Integer>() {
                    @Override
                    public Integer call() throws Exception {
                        return method3();
                    }
                });
                Future<Integer> resultFuture4 = executorService.submit(new Callable<Integer>() {
                    @Override
                    public Integer call() throws Exception {
                        return method4();
                    }
                });
                return method5()+resultFuture3.get()+resultFuture4.get();
            }
        });
        int result = resultFuture1.get() + resultFuture2.get();
        
        System.out.println("result = "+result+", total cost "+(System.currentTimeMillis()-start)+" ms");

      	executorService.shutdown();
    }

    static int method1(){
        delay200ms();
        return 1;
    }
    static int method2(){
        delay200ms();
        return 2;
    }
    static int method3(){
        delay200ms();
        return 3;
    }
    static int method4(){
        delay200ms();
        return 4;
    }
    static int method5(){
        delay200ms();
        return 5;
    }

    static void delay200ms(){
        try{
            Thread.sleep(200);
        }catch (Exception e){
            e.printStackTrace();
        }
    }

}
```

最终控制台打印：

**result = 15, total cost 413 ms**

五个接口，如果同步调用，便是串行的效果，最终耗时必定在 1s 之上，而异步调用的优势便是，submit任务之后立刻返回，只有在调用 `future.get()` 方法时才会阻塞，而这期间多个异步方法便可以并发的执行。

## RPC 异步调用

我们的项目使用了 Motan 作为 RPC 框架，查看其 changeLog ，[0.3.0](https://github.com/weibocom/motan/tree/0.3.0) (2017-03-09) 该版本已经支持了 async 特性。可以让开发者很方便地实现 RPC 异步调用。

**1 为接口增加 @MotanAsync 注解**

```java
@MotanAsync
public interface DemoApi {
    DemoDto randomDemo(String id);
}
```

**2 添加 Maven 插件**

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.codehaus.mojo</groupId>
            <artifactId>build-helper-maven-plugin</artifactId>
            <version>1.10</version>
            <executions>
                <execution>
                    <phase>generate-sources</phase>
                    <goals>
                        <goal>add-source</goal>
                    </goals>
                    <configuration>
                        <sources>
                            <source>${project.build.directory}/generated-sources/annotations</source>
                        </sources>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

安装插件后，可以借助它生成一个和 DemoApi 关联的异步接口 DemoApiAsync 。

```java
public interface MotanDemoServiceAsync extends MotanDemoService {
  ResponseFuture helloAsync(String name);
}
```

**3 注入接口即可调用**

```java
@Service
public class DemoService {

    @MotanReferer
    DemoApi demoApi;

    @MotanReferer
    DemoApiAsync demoApiAsync;//<1>

    public DemoDto randomDemo(String id){
        DemoDto demoDto = demoApi.randomDemo(id);
        return demoDto;
    }

    public DemoDto randomDemoAsync(String id){
        ResponseFuture responseFuture = demoApiAsync.randomDemoAsync(id);//<2>
        DemoDto demoDto = (DemoDto) responseFuture.getValue();
        return demoDto;
    }

}
```

<1> DemoApiAsync 如何生成的已经介绍过，它和 DemoApi 并没有功能性的区别，仅仅是同步异步调用的差距，而 DemoApiAsync 实现的的复杂性完全由 RPC 框架帮助我们完成，开发者无需编写 Callable 接口。

<2> ResponseFuture 是 RPC 中 Future 的抽象，其本身也是 juc 中 Future 的子类，当 responseFuture.getValue() 调用时会阻塞。

## 总结

在异步调用中，如果发起一次异步调用后，立刻使用 future.get() ，则大致和同步调用等同。其真正的优势是在submit 和  future.get() 之间可以混杂一些非依赖性的耗时操作，而不是同步等待，从而充分利用时间片。

另外需要注意，如果异步调用涉及到数据的修改，则多个异步操作直接不能保证 happens-before 原则，这属于并发控制的范畴了，谨慎使用。查询操作则大多没有这样的限制。

在能使用并发的地方使用并发，不能使用的地方才选择同步，这需要我们思考更多细节，但可以最大限度的提升系统的性能。