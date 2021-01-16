---
title: gson 替换 fastjson 引发的线上问题分析
date: 2020-09-15 18:37:56
tags:
- JAVA
categories:
- JAVA
---

## 前言

Json 序列化框架存在的安全漏洞一直以来都是程序员们挂在嘴边调侃的一个话题，尤其是这两年 fastjson 由于被针对性研究，更是频频地的报出漏洞，出个漏洞不要紧，可安全团队总是用邮件催着线上应用要进行依赖升级，这可就要命了，我相信很多小伙伴也是不胜其苦，考虑了使用其他序列化框架替换 fastjson。这不，最近我们就有一个项目将 fastjson 替换为了 gson，引发了一个线上的问题。分享下这次的经历，以免大家踩到同样的坑，在此警示大家，规范千万条，安全第一条，升级不规范，线上两行泪。

## 问题描述

线上一个非常简单的逻辑，将对象序列化成 fastjson，再使用 HTTP 请求将字符串发送出去。原本工作的好好的，在将 fastjson 替换为 gson 之后，竟然引发了线上的 OOM。经过内存 dump 分析，发现竟然发送了一个 400 M+ 的报文，由于 HTTP 工具没有做发送大小的校验，强行进行了传输，直接导致了线上服务整体不可用。

<!-- more -->

## 问题分析

为什么同样是 Json 序列化，fastjson 没出过问题，而换成 gson 之后立马就暴露了呢？通过分析内存 dump 的数据，发现很多字段的值都是重复的，再结合我们业务数据的特点，一下子定位到了问题 -- gson 序列化重复对象存在严重的缺陷。

直接用一个简单的例子，来说明当时的问题。模拟线上的数据特性，使用 `List<Foo>` 添加进同一个引用对象

```java
Foo foo = new Foo();
Bar bar = new Bar();
List<Foo> foos = new ArrayList<>();
for(int i=0;i<3;i++){
    foos.add(foo);
}
bar.setFoos(foos);

Gson gson = new Gson();
String gsonStr = gson.toJson(bar);
System.out.println(gsonStr);

String fastjsonStr = JSON.toJSONString(bar);
System.out.println(fastjsonStr);
```

观察打印结果：

gson：

```json
{"foos":[{"a":"aaaaa"},{"a":"aaaaa"},{"a":"aaaaa"}]}
```

fastjson：

```json
{"foos":[{"a":"aaaaa"},{"$ref":"$.foos[0]"},{"$ref":"$.foos[0]"}]}
```

可以发现 gson 处理重复对象，是对每个对象都进行了序列化，而 fastjson 处理重复对象，是将除第一个对象外的其他对象使用引用符号 `$ref` 进行了标记。

当单个重复对象的数量非常多，以及单个对象的提交较大时，两种不同的序列化策略会导致一个质变，我们不妨来针对特殊的场景进行下对比。 

## 压缩比测试

- 序列化对象：包含大量的属性。以模拟线上的业务数据。

- 重复次数：200。即 List 中包含 200 个同一引用的对象，以模拟线上复杂的对象结构，扩大差异性。
- 序列化方式：gson、fastjson、Java、Hessian2。额外引入了 Java 和 Hessian2 的对照组，方便我们了解各个序列化框架在这个特殊场景下的表现。
- 主要观察各个序列化方式压缩后的字节大小，因为这关系到网络传输时的大小；次要观察反序列后 List 中还是不是同一个对象

```java
public class Main {

    public static void main(String[] args) throws IOException, ClassNotFoundException {
        Foo foo = new Foo();
        Bar bar = new Bar();
        List<Foo> foos = new ArrayList<>();
        for(int i=0;i<200;i++){
            foos.add(foo);
        }
        bar.setFoos(foos);
        // gson
        Gson gson = new Gson();
        String gsonStr = gson.toJson(bar);
        System.out.println(gsonStr.length());
        Bar gsonBar = gson.fromJson(fastjsonStr, Bar.class);
        System.out.println(gsonBar.getFoos().get(0) == gsonBar.getFoos().get(1));  
        // fastjson
        String fastjsonStr = JSON.toJSONString(bar);
        System.out.println(fastjsonStr.length());
        Bar fastjsonBar = JSON.parseObject(fastjsonStr, Bar.class);
        System.out.println(fastjsonBar.getFoos().get(0) == fastjsonBar.getFoos().get(1));
				// java
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        ObjectOutputStream oos = new ObjectOutputStream(byteArrayOutputStream);
        oos.writeObject(bar);
        oos.close();
        System.out.println(byteArrayOutputStream.toByteArray().length);
        ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(byteArrayOutputStream.toByteArray()));
        Bar javaBar = (Bar) ois.readObject();
        ois.close();
        System.out.println(javaBar.getFoos().get(0) == javaBar.getFoos().get(1));
        // hessian2
        ByteArrayOutputStream hessian2Baos = new ByteArrayOutputStream();
        Hessian2Output hessian2Output = new Hessian2Output(hessian2Baos);
        hessian2Output.writeObject(bar);
        hessian2Output.close();
        System.out.println(hessian2Baos.toByteArray().length);
        ByteArrayInputStream hessian2Bais = new ByteArrayInputStream(hessian2Baos.toByteArray());
        Hessian2Input hessian2Input = new Hessian2Input(hessian2Bais);
        Bar hessian2Bar = (Bar) hessian2Input.readObject();
        hessian2Input.close();
        System.out.println(hessian2Bar.getFoos().get(0) == hessian2Bar.getFoos().get(1));
    }

}
```

输出结果：

```shell
gson:
62810
false

fastjson:
4503
true

Java:
1540
true

Hessian2:
686
true
```

结论分析：由于单个对象序列化后的体积较大，采用引用表示的方式可以很好的缩小体积，可以发现 gson 并没有采取这种序列化优化策略，导致体积膨胀。甚至一贯不被看好的 Java 序列化都比其优秀的多，而 Hessian2 更是夸张，直接比 gson 优化了 2个数量级。并且反序列化后，gson 并不能将原本是同一引用的对象还原回去，而其他的序列化框架均可以实现这一点。

## 吞吐量测试

除了关注序列化之后数据量的大小，各个序列化的吞吐量也是我们关心的一个点。使用基准测试可以精准地测试出各个序列化方式的吞吐量。

```java
@BenchmarkMode({Mode.Throughput})
@State(Scope.Benchmark)
public class MicroBenchmark {

    private Bar bar;

    @Setup
    public void prepare() {
        Foo foo = new Foo();
        Bar bar = new Bar();
        List<Foo> foos = new ArrayList<>();
        for(int i=0;i<200;i++){
            foos.add(foo);
        }
        bar.setFoos(foos);
    }

    Gson gson = new Gson();

    @Benchmark
    public void gson(){
        String gsonStr = gson.toJson(bar);
        gson.fromJson(gsonStr, Bar.class);
    }

    @Benchmark
    public void fastjson(){
        String fastjsonStr = JSON.toJSONString(bar);
        JSON.parseObject(fastjsonStr, Bar.class);
    }

    @Benchmark
    public void java() throws Exception {
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        ObjectOutputStream oos = new ObjectOutputStream(byteArrayOutputStream);
        oos.writeObject(bar);
        oos.close();

        ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(byteArrayOutputStream.toByteArray()));
        Bar javaBar = (Bar) ois.readObject();
        ois.close();
    }

    @Benchmark
    public void hessian2() throws Exception {
        ByteArrayOutputStream hessian2Baos = new ByteArrayOutputStream();
        Hessian2Output hessian2Output = new Hessian2Output(hessian2Baos);
        hessian2Output.writeObject(bar);
        hessian2Output.close();


        ByteArrayInputStream hessian2Bais = new ByteArrayInputStream(hessian2Baos.toByteArray());
        Hessian2Input hessian2Input = new Hessian2Input(hessian2Bais);
        Bar hessian2Bar = (Bar) hessian2Input.readObject();
        hessian2Input.close();
    }

    public static void main(String[] args) throws RunnerException {
        Options opt = new OptionsBuilder()
            .include(MicroBenchmark.class.getSimpleName())
            .build();

        new Runner(opt).run();
    }

}
```

吞吐量报告：

```
Benchmark                 Mode  Cnt        Score         Error  Units
MicroBenchmark.fastjson  thrpt   25  6724809.416 ± 1542197.448  ops/s
MicroBenchmark.gson      thrpt   25  1508825.440 ±  194148.657  ops/s
MicroBenchmark.hessian2  thrpt   25   758643.567 ±  239754.709  ops/s
MicroBenchmark.java      thrpt   25   734624.615 ±   66892.728  ops/s
```

是不是有点出乎意料，fastjson 竟然独领风骚，文本类序列化的吞吐量相比二进制序列化的吞吐量要高出一个数量级，分别是每秒百万级和每秒十万级的吞吐量。

## 整体测试结论

- fastjson 序列化过后带有 $ 的引用标记也能够被 gson 正确的反序列化，但笔者并没有找到让 gson 序列化时转换成引用的配置
- fastjson、hessian、java 均支持循环引用的解析；gson 不支持
- fastjson 可以设置 DisableCircularReferenceDetect，关闭循环引用和重复引用的检测
- gson 反序列化之前的同一个引用的对象，在经历了序列化再反序列化回来之后，不会被认为是同一个对象，可能会导致内存对象数量的膨胀；而 fastjson、java、hessian2 等序列化方式由于记录的是引用标记，不存在该问题
- 以笔者的测试 case 为例，hessian2 具有非常强大的序列化压缩比，适合大报文序列化后供网络传输的场景使用
- 以笔者的测试 case 为例，fastjson 具有非常高的吞吐量，对得起它的 fast，适合需要高吞吐的场景使用
- 序列化还需要考虑到是否支持循环引用，是否支持循环对象优化，是否支持枚举类型、集合、数组、子类、多态、内部类、泛型等综合场景，以及是否支持可视化等比较的场景，增删字段后的兼容性等等特性。综合来看，笔者比较推荐 hessian2 和 fastjson 两种序列化方式

## 总结

大家都知道 fastjson 为了快，做了相对一些较为 hack 的逻辑，这也导致其漏洞较多，但我认为编码都是在 trade off 之中进行的，如果有一个完美的框架，那其他竞品框架早就不会存在了。笔者对各个序列化框架的研究也不深，可能你会说 jackson 更加优秀，我只能说能解决你的场景遇到的问题，那就是合适的框架。

最后，想要替换序列化框架时一定要慎重，了解清楚替代框架的特性，可能原先框架解决的问题，新的框架不一定能很好的 cover。