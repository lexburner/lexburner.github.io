---
title: 深入理解 RPC 之序列化篇 --Kryo
date: 2017-11-28 22:15:28
tags: 
- RPC
categories: RPC
---

一年前，笔者刚刚接触 RPC 框架，从单体式应用向分布式应用的变革无疑是让人兴奋的，同时也对 RPC 背后到底做了哪些工作产生了兴趣，但其底层的设计对新手而言并不是很友好，其涉及的一些常用技术点都有一定的门槛。如传输层常常使用的 netty，之前完全没听过，想要学习它，需要掌握前置知识点 nio；协议层，包括了很多自定义的协议，而每个 RPC 框架的实现都有差异；代理层的动态代理技术，如 jdk 动态代理，虽然实战经验不多，但至少还算会用，而 cglib 则又有一个盲区；序列化层倒还算是众多层次中相对简单的一环，但 RPC 为了追求可扩展性，性能等诸多因素，通常会支持多种序列化方式以供使用者插拔使用，一些常用的序列化方案 hessian，kryo，Protobuf 又得熟知...

这个系列打算就 RPC 框架涉及到的一些知识点进行探讨，本篇先从序列化层的一种选择 --kryo 开始进行介绍。

## 序列化概述

大白话介绍下 RPC 中序列化的概念，可以简单理解为对象 --> 字节的过程，同理，反序列化则是相反的过程。为什么需要序列化？因为网络传输只认字节。所以互信的过程依赖于序列化。有人会问，FastJson 转换成字符串算不算序列化？对象持久化到数据库算不算序列化？没必要较真，广义上理解即可。

## JDK 序列化

可能你没用过 kryo，没用过 hessian，但你一定用过 jdk 序列化。我最早接触 jdk 序列化，是在大二的 JAVA 大作业中，《XX 管理系统》需要把对象保存到文件中（那时还没学数据库），jdk 原生支持的序列化方式用起来也很方便。

```java
class Student implements Serializable{  
   private String name;  
}  
class Main{
   public static void main(String[] args) throws Exception{  
      // create a Student
      Student st = new Student("kirito");  
     // serialize the st to student.db file  
     ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("student.db"));  
     oos.writeObject(st);  
     oos.close();  
     // deserialize the object from student.db
     ObjectInputStream ois = new ObjectInputStream(new FileInputStream("student.db"));  
     Student kirito = (Student) ois.readObject();  
     ois.close();  
    // assert
    assert "kirito".equals(kirito.getName());  
   }  
}  
```

Student 实体类需要实现 Serializable 接口，以告知其可被序列化。

序列化协议的选择通常有下列一些常用的指标：

1. 通用性。是否只能用于 java 间序列化 / 反序列化，是否跨语言，跨平台。
2. 性能。分为空间开销和时间开销。序列化后的数据一般用于存储或网络传输，其大小是很重要的一个参数；解析的时间也影响了序列化协议的选择，如今的系统都在追求极致的性能。
3. 可扩展性。系统升级不可避免，某一实体的属性变更，会不会导致反序列化异常，也应该纳入序列化协议的考量范围。
4. 易用性。API 使用是否复杂，会影响开发效率。

容易用的模型通常性能不好，性能好的模型通常用起来都比较麻烦。显然，JDK 序列化属于前者。我们不过多介绍它，直接引入今天的主角 kryo 作为它的替代品。

## Kryo 入门

### 引入依赖

```xml
    <dependency>
        <groupId>com.esotericsoftware</groupId>
        <artifactId>kryo</artifactId>
        <version>4.0.1</version>
    </dependency>
```

由于其底层依赖于 ASM 技术，与 Spring 等框架可能会发生 ASM 依赖的版本冲突（文档中表示这个冲突还挺容易出现）所以提供了另外一个依赖以供解决此问题

```xml
    <dependency>
        <groupId>com.esotericsoftware</groupId>
        <artifactId>kryo-shaded</artifactId>
        <version>4.0.1</version>
    </dependency>
```

### 快速入门

```java
class Student implements Serializable{  
   private String name;  
}  
public class Main {
    public static void main(String[] args) throws Exception{
        Kryo kryo = new Kryo();
        Output output = new Output(new FileOutputStream("student.db"));
        Student kirito = new Student("kirito");
        kryo.writeObject(output, kirito);
        output.close();
        Input input = new Input(new FileInputStream("student.db"));
        Student kiritoBak = kryo.readObject(input, Student.class);
        input.close();
        assert "kirito".equals(kiritoBak.getName());
    }
}
```

不需要注释也能理解它的执行流程，和 jdk 序列化差距并不是很大。

### 三种读写方式

Kryo 共支持三种读写方式

1. 如果知道 class 字节码，并且对象不为空

```java
    kryo.writeObject(output, someObject);
    // ...
    SomeClass someObject = kryo.readObject(input, SomeClass.class);
```

快速入门中的序列化 / 反序列化的方式便是这一种。而 Kryo 考虑到 someObject 可能为 null，也会导致返回的结果为 null，所以提供了第二套读写方式。

2. 如果知道 class 字节码，并且对象可能为空

```java
    kryo.writeObjectOrNull(output, someObject);
    // ...
    SomeClass someObject = kryo.readObjectOrNull(input, SomeClass.class);
```

但这两种方法似乎都不能满足我们的需求，在 RPC 调用中，序列化和反序列化分布在不同的端点，对象的类型确定，我们不想依赖于手动指定参数，最好是...emmmmm... 将字节码的信息直接存放到序列化结果中，在反序列化时自行读取字节码信息。Kryo 考虑到了这一点，于是提供了第三种方式。

3. 如果实现类的字节码未知，并且对象可能为 null

```java
    kryo.writeClassAndObject(output, object);
    // ...
    Object object = kryo.readClassAndObject(input);
    if (object instanceof SomeClass) {
       // ...
    }
```

我们牺牲了一些空间一些性能去存放字节码信息，但这种方式是我们在 RPC 中应当使用的方式。

### 我们关心的问题

继续介绍 Kryo 特性之前，不妨让我们先思考一下，一个序列化工具或者一个序列化协议，应当需要考虑哪些问题。比如，支持哪些类型的序列化？循环引用会不会出现问题？在某个类增删字段之后反序列化会报错吗？等等等等....

带着我们考虑到的这些疑惑，以及我们暂时没考虑到的，但 Kryo 帮我们考虑到的，来看看 Kryo 到底支持哪些特性。

### 支持的序列化类型

| boolean       | Boolean  | byte                      | Byte                     | char             |
| ------------- | -------- | ------------------------- | ------------------------ | ---------------- |
| Character     | short    | Short                     | int                      | Integer          |
| long          | Long     | float                     | Float                    | double           |
| Double        | byte[]   | String                    | BigInteger               | BigDecimal       |
| Collection    | Date     | Collections.emptyList     | Collections.singleton    | Map              |
| StringBuilder | TreeMap  | Collections.emptyMap      | Collections.emptySet     | KryoSerializable |
| StringBuffer  | Class    | Collections.singletonList | Collections.singletonMap | Currency         |
| Calendar      | TimeZone | Enum                      | EnumSet                  |                  |

表格中支持的类型一览无余，这都是其默认支持的。

```java
    Kryo kryo = new Kryo();
    kryo.addDefaultSerializer(SomeClass.class, SomeSerializer.class);
```

这样的方式，也可以为一个 Kryo 实例扩展序列化器。

总体而言，Kryo 支持以下的类型：

- 枚举
- 集合、数组
- 子类 / 多态
- 循环引用
- 内部类
- 泛型

但需要注意的是，**Kryo 不支持 Bean 中增删字段 **。如果使用 Kryo 序列化了一个类，存入了 Redis，对类进行了修改，会导致反序列化的异常。

另外需要注意的一点是使用反射创建的一些类序列化的支持。如使用 Arrays.asList(); 创建的 List 对象，会引起序列化异常。

```
Exception in thread "main" com.esotericsoftware.kryo.KryoException: Class cannot be created (missing no-arg constructor): java.util.Arrays$ArrayList
```

但 new ArrayList() 创建的 List 对象则不会，使用时需要注意，可以使用第三方库对 Kryo 进行序列化类型的扩展。如 https://github.com/magro/kryo-serializers 所提供的。

** 不支持包含无参构造器类的反序列化 **，尝试反序列化一个不包含无参构造器的类将会得到以下的异常：

```
Exception in thread "main" com.esotericsoftware.kryo.KryoException: Class cannot be created (missing no-arg constructor): moe.cnkirito.Xxx
```

保证每个类具有无参构造器是应当遵守的编程规范，但实际开发中一些第三库的相关类不包含无参构造，的确是有点麻烦。

### 线程安全

Kryo 是线程不安全的，意味着每当需要序列化和反序列化时都需要实例化一次，或者借助 ThreadLocal 来维护以保证其线程安全。

```java
private static final ThreadLocal<Kryo> kryos = new ThreadLocal<Kryo>() {
	protected Kryo initialValue() {
		Kryo kryo = new Kryo();
		// configure kryo instance, customize settings
		return kryo;
	};
};

// Somewhere else, use Kryo
Kryo k = kryos.get();
...
```

### Kryo 相关配置参数详解

每个 Kryo 实例都可以拥有两个配置参数，这值得被拉出来单独聊一聊。

```java
kryo.setRegistrationRequired(false);// 关闭注册行为
kryo.setReferences(true);// 支持循环引用
```

Kryo 支持对注册行为，如 `kryo.register(SomeClazz.class);`, 这会赋予该 Class 一个从 0 开始的编号，但 Kryo 使用注册行为最大的问题在于，其不保证同一个 Class 每一次注册的号码想用，这与注册的顺序有关，也就意味着在不同的机器、同一个机器重启前后都有可能拥有不同的编号，这会导致序列化产生问题，所以在分布式项目中，一般关闭注册行为。

第二个注意点在于循环引用，Kryo 为了追求高性能，可以关闭循环引用的支持。不过我并不认为关闭它是一件好的选择，大多数情况下，请保持 `kryo.setReferences(true)`。

### 常用 Kryo 工具类

```java
public class KryoSerializer {
    public byte[] serialize(Object obj) {
        Kryo kryo = kryoLocal.get();
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        Output output = new Output(byteArrayOutputStream);//<1>
        kryo.writeClassAndObject(output, obj);//<2>
        output.close();
        return byteArrayOutputStream.toByteArray();
    }

    public <T> T deserialize(byte[] bytes) {
        Kryo kryo = kryoLocal.get();
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(bytes);
        Input input = new Input(byteArrayInputStream);// <1>
        input.close();
        return (T) kryo.readClassAndObject(input);//<2>
    }

    private static final ThreadLocal<Kryo> kryoLocal = new ThreadLocal<Kryo>() {//<3>
        @Override
        protected Kryo initialValue() {
            Kryo kryo = new Kryo();
            kryo.setReferences(true);// 默认值为 true, 强调作用
            kryo.setRegistrationRequired(false);// 默认值为 false, 强调作用
            return kryo;
        }
    };
    
}
```

<1> Kryo 的 Input 和 Output 接收一个 InputStream 和 OutputStream，Kryo 通常完成字节数组和对象的转换，所以常用的输入输出流实现为 ByteArrayInputStream/ByteArrayOutputStream。

<2> writeClassAndObject 和 readClassAndObject 配对使用在分布式场景下是最常见的，序列化时将字节码存入序列化结果中，便可以在反序列化时不必要传入字节码信息。

<3> 使用 ThreadLocal 维护 Kryo 实例，这样减少了每次使用都实例化一次 Kryo 的开销又可以保证其线程安全。

### 参考文章

https://github.com/EsotericSoftware/kryo

[Kryo 使用指南](http://www.cnblogs.com/hntyzgn/p/7122709.html)

[序列化与反序列化](https://kb.cnblogs.com/page/515982/)

------------------------------------------------------------------------------------------------------------------------

更多的序列化方案，和 RPC 其他层次中会涉及到的技术，在后续的文章中进行逐步介绍。
