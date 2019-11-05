---
title: Spring Data Redis（二）-- 序列化
date: 2017-10-28 16:10:55
tags:
- Spring Data Redis
categories:
- Spring Data Redis
---

## 默认序列化方案

在上一篇文章《Spring Data Redis（一）》中，我们执行了这样一个操作：

```java
redisTemplate.opsForValue().set("student:1","kirito");
```

试图使用 RedisTemplate 在 Redis 中存储一个键为“student:1”，值为“kirito”的 String 类型变量（redis 中通常使用‘:’作为键的分隔符）。那么是否真的如我们所预想的那样，在 Redis 中存在这样的键值对呢？

这可以说是 Redis 中最基础的操作了，但严谨起见，还是验证一下为妙，使用 RedisDesktopManager 可视化工具，或者 redis-cli 都可以查看 redis 中的数据。

![查看 redis](https://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720171028125803.png)

emmmmm，大概能看出是我们的键值对，但前面似乎多了一些奇怪的 16 进制字符，在不了解 RedisTemplate 工作原理的情况下，自然会对这个现象产生疑惑。

首先看看 springboot 如何帮我们自动完成 RedisTemplate 的配置：

```java
@Configuration
protected static class RedisConfiguration {

     @Bean
     @ConditionalOnMissingBean(name = "redisTemplate")
     public RedisTemplate<Object, Object> redisTemplate(
           RedisConnectionFactory redisConnectionFactory)
                 throws UnknownHostException {
        RedisTemplate<Object, Object> template = new RedisTemplate<Object, Object>();
        template.setConnectionFactory(redisConnectionFactory);
        return template;
     }
}
```

没看出什么特殊的设置，于是我们进入 RedisTemplate 自身的源码中一窥究竟。

首先是在类开头声明了一系列的序列化器：

```java
private boolean enableDefaultSerializer = true;// 配置默认序列化器
private RedisSerializer<?> defaultSerializer;
private ClassLoader classLoader;

private RedisSerializer keySerializer = null;
private RedisSerializer valueSerializer = null;
private RedisSerializer hashKeySerializer = null;
private RedisSerializer hashValueSerializer = null;
private RedisSerializer<String> stringSerializer = new StringRedisSerializer();
```

看到了我们关心的 `keySerializer` 和 `valueSerializer`，在 RedisTemplate.afterPropertiesSet() 方法中，可以看到，默认的序列化方案:

```java
public void afterPropertiesSet() {
     super.afterPropertiesSet();
     boolean defaultUsed = false;
     if (defaultSerializer == null) {
        defaultSerializer = new JdkSerializationRedisSerializer(
              classLoader != null ? classLoader : this.getClass().getClassLoader());
     }
     if (enableDefaultSerializer) {
        if (keySerializer == null) {
           keySerializer = defaultSerializer;
           defaultUsed = true;
        }
        if (valueSerializer == null) {
           valueSerializer = defaultSerializer;
           defaultUsed = true;
        }
        if (hashKeySerializer == null) {
           hashKeySerializer = defaultSerializer;
           defaultUsed = true;
        }
        if (hashValueSerializer == null) {
           hashValueSerializer = defaultSerializer;
           defaultUsed = true;
        }
    }
	...
    initialized = true;
}
```

默认的方案是使用了 `JdkSerializationRedisSerializer`，所以导致了前面的结果，注意：字符串和使用 jdk 序列化之后的字符串是两个概念。

我们可以查看 set 方法的源码：

```java
public void set(K key, V value) {
   final byte[] rawValue = rawValue(value);
   execute(new ValueDeserializingRedisCallback(key) {

      protected byte[] inRedis(byte[] rawKey, RedisConnection connection) {
         connection.set(rawKey, rawValue);
         return null;
      }
   }, true);
}
```

最终与 Redis 交互使用的是原生的 connection，键值则全部是字节数组，意味着所有的序列化都依赖于应用层完成，Redis 只认字节！这也是引出本节介绍的初衷，序列化是与 Redis 打交道很关键的一个环节。

## StringRedisSerializer

在我不长的使用 Redis 的时间里，其实大多数操作是字符串操作，键值均为字符串，String.getBytes() 即可满足需求。spring-data-redis 也考虑到了这一点，其一，提供了 StringRedisSerializer 的实现，其二，提供了 StringRedisTemplate，继承自 RedisTemplate。

```java
public class StringRedisTemplate extends RedisTemplate<String, String>{
    public StringRedisTemplate() {
        RedisSerializer<String> stringSerializer = new StringRedisSerializer();
        setKeySerializer(stringSerializer);
        setValueSerializer(stringSerializer);
        setHashKeySerializer(stringSerializer);
        setHashValueSerializer(stringSerializer);
    }
  	...
}
```
即只能存取字符串。尝试执行如下的代码：

```java
@Autowired
StringRedisTemplate stringRedisTemplate;

stringRedisTemplate.opsForValue().set("student:2", "SkYe");
```

再同样观察 RedisDesktopManager 中的变化：

![查看 redis](https://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720171028140012.png)

由于更换了序列化器，我们得到的结果也不同了。

## 项目中序列化器使用的注意点

理论上，字符串（本质是字节）其实是万能格式，是否可以使用 StringRedisTemplate 将复杂的对象存入 Redis 中，答案当然是肯定的。可以在应用层手动将对象序列化成字符串，如使用 fastjson，jackson 等工具，反序列化时也是通过字符串还原出原来的对象。而如果是用 `redisTemplate.opsForValue().set("student:3",new Student(3,"kirito"));` 便是依赖于内部的序列化器帮我们完成这样的一个流程，和使用 `stringRedisTemplate.opsForValue().set("student:3",JSON.toJSONString(new Student(3,"kirito")));`

其实是一个等价的操作。但有两点得时刻记住两点:

1. Redis 只认字节。
2. 使用什么样的序列化器序列化，就必须使用同样的序列化器反序列化。

曾经在 review 代码时发现，项目组的两位同事操作 redis，一个使用了 RedisTemplate，一个使用了 StringRedisTemplate，当他们操作同一个键时，key 虽然相同，但由于序列化器不同，导致无法获取成功。差异虽小，但影响是非常可怕的。

另外一点是，微服务不同模块连接了同一个 Redis，在共享内存中交互数据，可能会由于版本升级，模块差异，导致相互的序列化方案不一致，也会引起问题。如果项目中途切换了序列化方案，也可能会引起 Redis 中老旧持久化数据的反序列化异常，同样需要引起注意。最优的方案自然是在项目初期就统一好序列化方案，所有模块引用同一份依赖，避免不必要的麻烦（或者干脆全部使用默认配置）。

## 序列化接口 RedisSerializer

无论是 RedisTemplate 中默认使用的 `JdkSerializationRedisSerializer`，还是 StringRedisTemplate 中使用的 `StringRedisSerializer` 都是实现自统一的接口 `RedisSerializer`

```java
public interface RedisSerializer<T> {
   byte[] serialize(T t) throws SerializationException;
   T deserialize(byte[] bytes) throws SerializationException;
}
```

在 spring-data-redis 中提供了其他的默认实现，用于替换默认的序列化方案。

- GenericToStringSerializer 依赖于内部的 ConversionService，将所有的类型转存为字符串
- GenericJackson2JsonRedisSerializer 和 Jackson2JsonRedisSerializer 以 JSON 的形式序列化对象
- OxmSerializer 以 XML 的形式序列化对象

我们可能出于什么样的目的修改序列化器呢？按照个人理解可以总结为以下几点：

1. 各个工程间约定了数据格式，如使用 JSON 等通用数据格式，可以让异构的系统接入 Redis 同样也能识别数据，而 JdkSerializationRedisSerializer 则不具备这样灵活的特性
2. 数据的可视化，在项目初期我曾经偏爱 JSON 序列化，在运维时可以清晰地查看各个 value 的值，非常方便。
3. 效率问题，如果需要将大的对象存入 Value 中，或者 Redis IO 非常频繁，替换合适的序列化器便可以达到优化的效果。

## 替换默认的序列化器

可以将全局的 RedisTemplate 覆盖，也可以在使用时在局部实例化一个 RedisTemplate 替换（不依赖于 IOC 容器）需要根据实际的情况选择替换的方式，以 Jackson2JsonRedisSerializer 为例介绍全局替换的方式：

```java
@Bean
public RedisTemplate redisTemplate(RedisConnectionFactory redisConnectionFactory) {
    RedisTemplate redisTemplate = new RedisTemplate();
    redisTemplate.setConnectionFactory(redisConnectionFactory);
    Jackson2JsonRedisSerializer jackson2JsonRedisSerializer = new Jackson2JsonRedisSerializer(Object.class);

    ObjectMapper objectMapper = new ObjectMapper();// <1>
    objectMapper.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
    objectMapper.enableDefaultTyping(ObjectMapper.DefaultTyping.NON_FINAL);

    jackson2JsonRedisSerializer.setObjectMapper(objectMapper);

    redisTemplate.setKeySerializer(new StringRedisSerializer()); // <2>
    redisTemplate.setValueSerializer(jackson2JsonRedisSerializer); // <2>

    redisTemplate.afterPropertiesSet();
    return redisTemplate;
}
```

<1> 修改 Jackson 序列化时的默认行为

<2> 手动指定 RedisTemplate 的 Key 和 Value 的序列化器

然后使用 RedisTemplate 进行保存：

```java
@Autowired
StringRedisTemplate stringRedisTemplate;

public void test() {
    Student student3 = new Student();
    student3.setName("kirito");
    student3.setId("3");
    student3.setHobbies(Arrays.asList("coding","write blog","eat chicken"));
    redisTemplate.opsForValue().set("student:3",student3);
}
```

紧接着，去 RedisDesktopManager 中查看结果：

![查看 Redis](https://kirito.iocoder.cn/QQ%E5%9B%BE%E7%89%8720171028225412.png)

标准的 JSON 格式

## 实现 Kryo 序列化

我们也可以考虑根据自己项目和需求的特点，扩展序列化器，这是非常方便的。比如前面提到的，为了追求性能，可能考虑使用 Kryo 序列化器替换缓慢的 JDK 序列化器，如下是一个参考实现（为了 demo 而写，未经过生产验证）

```java
public class KryoRedisSerializer<T> implements RedisSerializer<T> {
    private final static Logger logger = LoggerFactory.getLogger(KryoRedisSerializer.class);
    private static final ThreadLocal<Kryo> kryos = new ThreadLocal<Kryo>() {
        protected Kryo initialValue() {
            Kryo kryo = new Kryo();
            return kryo;
        };
    };
    @Override
    public byte[] serialize(Object obj) throws SerializationException {
        if (obj == null) {
            throw new RuntimeException("serialize param must not be null");
        }
        Kryo kryo = kryos.get();
        Output output = new Output(64, -1);
        try {
            kryo.writeClassAndObject(output, obj);
            return output.toBytes();
        } finally {
            closeOutputStream(output);
        }
    }
    @Override
    public T deserialize(byte[] bytes) throws SerializationException {
        if (bytes == null) {
            return null;
        }
        Kryo kryo = kryos.get();
        Input input = null;
        try {
            input = new Input(bytes);
            return (T) kryo.readClassAndObject(input);
        } finally {
            closeInputStream(input);
        }
    }
    private static void closeOutputStream(OutputStream output) {
        if (output != null) {
            try {
                output.flush();
                output.close();
            } catch (Exception e) {
                logger.error("serialize object close outputStream exception", e);
            }
        }
    }
    private static void closeInputStream(InputStream input) {
        if (input != null) {
            try {
                input.close();
            } catch (Exception e) {
                logger.error("serialize object close inputStream exception", e);
            }
        }
    }

} 
```

由于 Kyro 是线程不安全的，所以使用了一个 ThreadLocal 来维护，也可以挑选其他高性能的序列化方案如 Hessian，Protobuf...
