---
title: 浅析 SpringMVC 中返回对象的循环引用问题
toc: true
type: 1
date: 2021-07-15 00:55:50
category:
- Spring
tags:
- Spring
---

## 问题发现

@RestController、@ResponseBody 等注解是我们在写 Web 应用时打交道最多的注解了，我们经常有这样的需求：返回一个对象给前端，SpringMVC 帮助我们序列化成 JSON 对象。而今天我要分享的话题也不是什么高深的内容，可能大家多多少少也都遇到过，那就是返回对象中存在循环引用时的问题，分享我的一些思考。

该问题非常简单容易复现，直接上代码。

准备两个循环引用的对象：

```java
@Data
public class Person {
    private String name;
    private IdCard idCard;
}

@Data
public class IdCard {
    private String id;
    private Person person;
}
```

<!-- more -->

在 SpringMVC 的 controller 中直接返回存在循环引用的对象：

```java
@RestController
public class HelloController {

    @RequestMapping("/hello")
    public Person hello() {
        Person person = new Person();
        person.setName("kirito");

        IdCard idCard = new IdCard();
        idCard.setId("xxx19950102xxx");

        person.setIdCard(idCard);
        idCard.setPerson(person);

        return person;
    }
}
```

执行 `curl localhost:8080/hello` 发现，直接报了一个 StackOverFlowError：

![StackOverFlow](https://image.cnkirito.cn/image-20210715011351293.png)

## 问题剖析

不难理解这中间发生了什么，从堆栈和常识中都应当了解到一个事实，SpringMVC 默认使用了 jackson 作为 HttpMessageConverter，这样当我们返回对象时，会经过 jackson 的 serializer 序列化成 json 串，而另一个事实便是 jackson 是无法解析 java 中的循环引用的，套娃式的解析，最终导致了 StackOverFlowError。

有人会说，为什么你会有循环引用呢？天知道业务场景有多奇葩，既然 Java 没有限制循环引用的存在，那就肯定会有某一合理的场景存在该可能性，如果你在线上的一个接口一直平稳运行着，知道有一天，碰到了一个包含循环引用的对象，你看着打印出来的 StackOverFlowError 的堆栈，开始怀疑人生，是哪个小（大）可（S）爱（B）干的这种事！

我们先假设循环引用存在的合理性，如何解决该问题呢？最简单的解法：单向维护关联，参考 Hibernate 中的 OneToMany 关联中单向映射的思想，这需要干掉 IdCard 中的 Person 成员变量。或者，借助于 jackson 提供的注解，指定忽略循环引用的字段，例如这样：

```java
@Data
public class IdCard {
    private String id;
    @JsonIgnore
    private Person person;
}
```

当然，我也翻阅了一些资料，尝试寻求 jackson 更优雅的解决方式，例如这两个注解：

```
@JsonManagedReference
@JsonBackReference
```

但在我看来，似乎他们并没有什么大用场。

当然，你如果不嫌弃经常出安全漏洞的 fastjson，也可以选择使用 `FastJsonHttpMessageConverter` 替换掉 jackson 的默认实现，像下面这样：

```java
@Bean
public HttpMessageConverters fastJsonHttpMessageConverters() {
    //1、定义一个convert转换消息的对象
    FastJsonHttpMessageConverter fastConverter = new FastJsonHttpMessageConverter();

    //2、添加fastjson的配置信息
    FastJsonConfig fastJsonConfig = new FastJsonConfig();

    SerializerFeature[] serializerFeatures = new SerializerFeature[]{
        //    输出key是包含双引号
        //                SerializerFeature.QuoteFieldNames,
        //    是否输出为null的字段,若为null 则显示该字段
        //                SerializerFeature.WriteMapNullValue,
        //    数值字段如果为null，则输出为0
        SerializerFeature.WriteNullNumberAsZero,
        //     List字段如果为null,输出为[],而非null
        SerializerFeature.WriteNullListAsEmpty,
        //    字符类型字段如果为null,输出为"",而非null
        SerializerFeature.WriteNullStringAsEmpty,
        //    Boolean字段如果为null,输出为false,而非null
        SerializerFeature.WriteNullBooleanAsFalse,
        //    Date的日期转换器
        SerializerFeature.WriteDateUseDateFormat,
        //    循环引用
        //SerializerFeature.DisableCircularReferenceDetect,
    };

    fastJsonConfig.setSerializerFeatures(serializerFeatures);
    fastJsonConfig.setCharset(Charset.forName("UTF-8"));

    //3、在convert中添加配置信息
    fastConverter.setFastJsonConfig(fastJsonConfig);

    //4、将convert添加到converters中
    HttpMessageConverter<?> converter = fastConverter;

    return new HttpMessageConverters(converter);
}
```

你可以自定义一些 json 转换时的 feature，当然我今天主要关注 `SerializerFeature.DisableCircularReferenceDetect ` 这一属性，只要不显示开启该特性，fastjson 默认就能处理循环引用的问题。

如上配置后，让我们看看效果：

```json
{"idCard":{"id":"xxx19950102xxx","person":{"$ref":".."}},"name":"kirito"}
```

已经正常返回了，fastjson 使用了`"$ref":".."` 这样的标识，解决了循环引用的问题，如果继续使用 fastjson 反序列化，依旧可以解析成同一对象，其实我在之前的文章中已经介绍过这一特性了《[gson 替换 fastjson 引发的线上问题分析](https://www.cnkirito.moe/serialize-practice/)》。

使用 FastJsonHttpMessageConverter 可以彻底规避掉循环引用的问题，这对于返回类型不固定的场景十分有帮助，而 @JsonIgnore 只能作用于那些固定结构的循环引用对象上。

## 问题思考

值得一提的是，为什么一般标准的 JSON 类库并没有如此关注循环引用的问题呢？fastjson 看起来反而是个特例，我觉得主要还是 JSON 这种序列化的格式就是为了通用而存在的，`$ref` 这样的契约信息，并没有被 JSON 的规范去定义，fastjson 可以确保 `$ref` 在序列化、反序列化时能够正常解析，但如果是跨框架、跨系统、跨语言等场景，这一切都是个未知数了。说到底，这还是 Java 语言的循环引用和 JSON 通用规范不包含这一概念之间的 gap（可能 JSON 规范描述了这一特性，但我没有找到，如有问题，烦请指正）。

我到底应该选择 @JsonIgnore 还是使用 `FastJsonHttpMessageConverter`  呢？经历了上面的思考，我觉得各位看官应该能够根据自己的场景选择合适的方案了。

总结下，如果选择 `FastJsonHttpMessageConverter` ，改动较大，如果有较多的存量接口，建议做好回归，以确认解决循环引用问题的同时，带来其他不兼容的改动，并且，需要确认你的使用场景，如果出现了循环引用，fastjson 会使用 `$ref` 来记录引用信息，请确认你的前端或者接口方能够识别该信息，因为这可能并不是标准的 JSON 规范。你也可以选择 @JsonIgnore 来实现最小改动，但也同时需要注意，如果根据序列化的结果再次反序列化，引用信息可不会自动恢复。