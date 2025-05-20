---
title: 深入理解 RPC 之序列化篇 -- 总结篇
date: 2017-12-11 22:58:54
tags: 
- RPC
categories: RPC
toc: true
---

上一篇 [《深入理解 RPC 之序列化篇 --Kryo》](https://www.cnkirito.moe/2017/11/28/kryo-1/), 介绍了序列化的基础概念，并且详细介绍了 Kryo 的一系列特性，在这一篇中，简略的介绍其他常用的序列化器，并对它们进行一些比较。序列化篇仅仅由 Kryo 篇和总结篇构成可能有点突兀，等待后续有时间会补充详细的探讨。

## 定义抽象接口

```java
public interface Serialization {

   byte[] serialize(Object obj) throws IOException;

   <T> T deserialize(byte[] bytes, Class<T> clz) throws IOException;
}
```

RPC 框架中的序列化实现自然是种类多样，但它们必须遵循统一的规范，于是我们使用 `Serialization` 作为序列化的统一接口，无论何种方案都需要实现该接口。

<!-- more -->

## Kryo 实现

Kryo 篇已经给出了实现代码。

```java
public class KryoSerialization implements Serialization {

    @Override
    public byte[] serialize(Object obj) {
        Kryo kryo = kryoLocal.get();
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        Output output = new Output(byteArrayOutputStream);
        kryo.writeObject(output, obj);
        output.close();
        return byteArrayOutputStream.toByteArray();
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> clz) {
        Kryo kryo = kryoLocal.get();
        ByteArrayInputStream byteArrayInputStream = new ByteArrayInputStream(bytes);
        Input input = new Input(byteArrayInputStream);
        input.close();
        return (T) kryo.readObject(input, clz);
    }

    private static final ThreadLocal<Kryo> kryoLocal = new ThreadLocal<Kryo>() {
        @Override
        protected Kryo initialValue() {
            Kryo kryo = new Kryo();
            kryo.setReferences(true);
            kryo.setRegistrationRequired(false);
            return kryo;
        }
    };

}
```

所需依赖：

```xml
<dependency>
    <groupId>com.esotericsoftware</groupId>
    <artifactId>kryo</artifactId>
    <version>4.0.1</version>
</dependency>
```

## Hessian 实现

```java
public class Hessian2Serialization implements Serialization {

    @Override
    public byte[] serialize(Object data) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        Hessian2Output out = new Hessian2Output(bos);
        out.writeObject(data);
        out.flush();
        return bos.toByteArray();
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> clz) throws IOException {
        Hessian2Input input = new Hessian2Input(new ByteArrayInputStream(bytes));
        return (T) input.readObject(clz);
    }
}
```

所需依赖：

```xml
<dependency>
    <groupId>com.caucho</groupId>
    <artifactId>hessian</artifactId>
    <version>4.0.51</version>
</dependency>
```

大名鼎鼎的 Hessian 序列化方案经常被 RPC 框架用来作为默认的序列化方案，可见其必然具备一定的优势。其具体的优劣我们放到文末的总结对比中与其他序列化方案一起讨论。而在此，着重提一点 Hessian 使用时的坑点。

**BigDecimal 的反序列化 **

使用 Hessian 序列化包含 BigDecimal 字段的对象时会导致其值一直为 0，不注意这个 bug 会导致很大的问题，在最新的 4.0.51 版本仍然可以复现。解决方案也很简单，指定 BigDecimal 的序列化器即可，通过添加两个文件解决这个 bug：

**resources\META-INF\hessian\serializers**

```
java.math.BigDecimal=com.caucho.hessian.io.StringValueSerializer
```

**resources\META-INF\hessian\deserializers**

```
java.math.BigDecimal=com.caucho.hessian.io.BigDecimalDeserializer
```

##  Protostuff 实现

```java
public class ProtostuffSerialization implements Serialization {

    @Override
    public byte[] serialize(Object obj) throws IOException {
        Class clz = obj.getClass();
        LinkedBuffer buffer = LinkedBuffer.allocate(LinkedBuffer.DEFAULT_BUFFER_SIZE);
        try {
            Schema schema = RuntimeSchema.createFrom(clz);
            return ProtostuffIOUtil.toByteArray(obj, schema, buffer);
        } catch (Exception e) {
            throw e;
        } finally {
            buffer.clear();
        }
    }

    @Override
    public <T> T deserialize(byte[] bytes, Class<T> clz) throws IOException {
        T message = objenesis.newInstance(clz); // <1>
        Schema<T> schema = RuntimeSchema.createFrom(clz);
        ProtostuffIOUtil.mergeFrom(bytes, message, schema);
        return message;
    }

    private Objenesis objenesis = new ObjenesisStd(); // <2>


}
```

所需依赖：

```xml
<!-- Protostuff -->
<dependency>
    <groupId>com.dyuproject.protostuff</groupId>
    <artifactId>protostuff-core</artifactId>
    <version>1.0.9</version>
</dependency>
<dependency>
    <groupId>com.dyuproject.protostuff</groupId>
    <artifactId>protostuff-runtime</artifactId>
    <version>1.0.9</version>
</dependency>
<!-- Objenesis -->
<dependency>
    <groupId>org.objenesis</groupId>
    <artifactId>objenesis</artifactId>
    <version>2.5</version>
</dependency>
```

Protostuff 可以理解为 google protobuf 序列化的升级版本，protostuff-runtime 无需静态编译，这比较适合 RPC 通信时的特性，很少见到有人直接拿 protobuf  作为 RPC 的序列化器，而 protostuff-runtime 仍然占据一席之地。

<1>  使用 Protostuff 的一个坑点在于其反序列化时需用户自己实例化序列化后的对象，所以才有了 `T message = objenesis.newInstance(clz);` 这行代码。使用 objenesis 工具实例化一个需要的对象，而后使用 `ProtostuffIOUtil` 完成赋值操作。

<2> 上述的 `objenesis.newInstance(clz)` 可以由 `clz.newInstance()` 代替，后者也可以实例化一个对象，但如果对象缺少无参构造函数，则会报错。借助于 `objenesis` 可以绕开无参构造器实例化一个对象，且性能优于直接反射创建。所以一般在选择 Protostuff  作为序列化器时，一般配合 objenesis 使用。

## Fastjson 实现

```java
public class FastJsonSerialization implements Serialization {
    static final String charsetName = "UTF-8";
    @Override
    public byte[] serialize(Object data) throws IOException {
        SerializeWriter out = new SerializeWriter();
        JSONSerializer serializer = new JSONSerializer(out);
        serializer.config(SerializerFeature.WriteEnumUsingToString, true);//<1>
        serializer.config(SerializerFeature.WriteClassName, true);//<1>
        serializer.write(data);
        return out.toBytes(charsetName);
    }

    @Override
    public <T> T deserialize(byte[] data, Class<T> clz) throws IOException {
        return JSON.parseObject(new String(data), clz);
    }
}
```

所需依赖：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>fastjson</artifactId>
    <version>1.2.28</version>
</dependency>
```

<1> JSON 序列化注意对枚举类型的特殊处理；额外补充类名可以在反序列化时获得更丰富的信息。

## 序列化对比

在我的 PC 上对上述序列化方案进行测试：

** 测试用例：对一个简单 POJO 对象序列化 / 反序列化 100W 次 **

|            | serialize/ms | deserialize/ms |
| ---------- | ------------ | -------------- |
| Fastjson   | 2832         | 2242           |
| Kryo       | 2975         | 1987           |
| Hessian    | 4598         | 3631           |
| Protostuff | 2944         | 2541           |

** 测试用例：序列化包含 1000 个简单对象的 List，循环 1000 次 **

|            | serialize/ms | deserialize/ms |
| ---------- | ------------ | -------------- |
| Fastjson   | 2551         | 2821           |
| Kryo       | 1951         | 1342           |
| Hessian    | 1828         | 2213           |
| Protostuff | 1409         | 2813           |

对于耗时类型的测试需要做到预热 + 平均值等条件，测试后效果其实并不如人意，从我不太严谨的测试来看，并不能明显地区分出他们的性能。另外，Kryo 关闭 Reference 可以加速，Protostuff 支持静态编译加速，Schema 缓存等特性，每个序列化方案都有自身的特殊性，启用这些特性会伴随一些限制。但在 RPC 实际地序列化使用中不会利用到这些特性，所以在测试时并没有特别关照它们。

** 序列化包含 1000 个简单对象的 List，查看字节数 **

|            | 字节数 /byte |
| ---------- | -------- |
| Fastjson   | 120157   |
| Kryo       | 39134    |
| Hessian    | 86166    |
| Protostuff | 86084    |

字节数这个指标还是很直观的，Kryo 拥有绝对的优势，只有 Hessian，Protostuff 的一半，而 Fastjson 作为一个文本类型的序列化方案，自然无法和字节类型的序列化方案比较。而字节最终将用于网络传输，是 RPC 框架非常在意的一个性能点。

** 综合评价 **

经过个人测试，以及一些官方的测试结果，我觉得在 RPC 场景下，序列化的速度并不是一个很大考量标准，因为各个序列化方案都在有意优化速度，只要不是 jdk 序列化，速度就不会太慢。

Kryo：专为 JAVA 定制的序列化协议，序列化后字节数少，利于网络传输。但不支持跨语言（或支持的代价比较大）。dubbox 扩展中支持了 kryo 序列化协议。github 3018 star。

Hessian：支持跨语言，序列化后字节数适中，API 易用。是国内主流 rpc 框架：dubbo，motan 的默认序列化协议。[hessian.caucho.com](http://hessian.caucho.com/) 未托管在 github

Protostuff：提起 Protostuff 不得不说到 Protobuf。Protobuf 可能更出名一些，因为其是 google 的亲儿子，grpc 框架便是使用 protobuf 作为序列化协议，虽然 protobuf 与语言无关平台无关，但需要使用特定的语法编写 `.prpto` 文件，然后静态编译，这带了一些复杂性。而 protostuff 实际是对 protobuf 的扩展，protostuff-runtime 模块继承了 protobuf 性能，且不需要预编译文件，但与此同时，也失去了跨语言的特性。所以 protostuff 的定位是一个 JAVA 序列化框架，其性能略优于 Hessian。tip ：protostuff 反序列化时需用户自己初始化序列化后的对象，其只负责将该对象进行赋值。github 719 star。

Fastjson：作为一个 json 工具，被拉到 RPC 的序列化方案中似乎有点不妥，但 motan 该 RPC 框架除了支持 hessian 之外，还支持了 fastjson 的序列化。可以将其作为一个跨语言序列化的简易实现方案。github 11.8k star。

