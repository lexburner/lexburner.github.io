---
title: XML与javabean的转换
date: 2017-08-26 03:41:27
tags: 
- XML
categories:
- JAVA
---



XML可以说是一种被时代淘汰的数据传输格式，毕竟相比较JSON，其语法，表现形式，以及第三方类库的支持，都要略逊一筹，但最近在对接一些老接口时，主要还是以XML为主，而翻阅相关的文档以及博客，没看到很好的文章介绍如何使用xml进行数据传输，所以简单写下此文，做一下记录。内心多多少少还是会抵制对接如此老旧的接口，不过生活还是要继续。

## Code First

先上一段代码，展示一下如何封装，讲解放到后面

一个典型的对接方提供的XML如下：

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ORDER>
    <ORDER_NO>10086</ORDER_NO>
    <TOTAL_PRICE>3.14</TOTAL_PRICE>
    <CREATE_TIME>2017-08-26 03:39:30</CREATE_TIME>
    <ORDER_ITEMS>
        <ORDER_ITEM>
            <GOODS_NAME>德芙</GOODS_NAME>
            <NUM>3</NUM>
        </ORDER_ITEM>
        <ORDER_ITEM>
            <GOODS_NAME>旺仔</GOODS_NAME>
            <NUM>10</NUM>
        </ORDER_ITEM>
    </ORDER_ITEMS>
</ORDER>
```

而我们要对应的实体类，则应当如下：

```java
@XmlRootElement(name = "ORDER")// <1>
@XmlAccessorType(XmlAccessType.FIELD)// <1>
public class Order {

    @XmlElement(name = "ORDER_NO")// <1>
    private String orderNo;

    @XmlElement(name = "TOTAL_PRICE")
    private BigDecimal totalPrice;

    @XmlElement(name = "CREATE_TIME")
    @XmlJavaTypeAdapter(DateAdapter.class) // <2>
    private Date createTime;

    @XmlElementWrapper(name = "ORDER_ITEMS") // <3>
    @XmlElement(name = "ORDER_ITEM")
    private List<OrderItem> orderItems;

}
```

```java
@XmlAccessorType(XmlAccessType.FIELD)
public class OrderItem {

    @XmlElement(name = "GOODS_NAME")
    private String goodsName;

    @XmlElement(name = "NUM")
    private Integer num;

}
```

我举的这个示例基本包含一般情况下所有可能出现的需求

<1> 常用注解XmlRootElement，XmlAccessorType，XmlElement

<2> 日期转换的适配器注解

<3> 如何在XML中设置集合

在介绍这三点之前，先给出转换的工具类

<!-- more -->

## 转换工具类

```java
public class XML {

    public static String toXmlString(Object obj) {
        String result;
        try {
            JAXBContext context = JAXBContext.newInstance(obj.getClass());
            Marshaller marshaller = context.createMarshaller();
            StringWriter writer = new StringWriter();
            marshaller.marshal(obj, writer);
            result = writer.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return result;
    }

    public static <T> T parseObject(String input, Class<T> claaz) {
        Object result;
        try {
            JAXBContext context = JAXBContext.newInstance(claaz);
            Unmarshaller unmarshaller = context.createUnmarshaller();
            result = unmarshaller.unmarshal(new StringReader(input));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return (T) result;
    }

}
```

JSON工具类中，笔者习惯于使用fastjson，所以干脆连同工具类类名命名和方法命名都按照了它的风格，只有两个方法。

## 注解的介绍

给实体类加上注解，再使用工具类，就可以实现实体和XML的相互转换了。那么前面提到的三个注意点中的相关注解分别代表了什么含义呢？

- @XmlRootElement

  作用域：类

  代表一个XML对象的根节点，常使用name属性来可以指定生成XML之后的具体名称

- @XmlElement

  作用域：字段，方法，参数（不常用）

  代表一个XML对象的普通界点信息，常使用name属性来指定生成XML之后的具体名称。需要注意与@XmlAccessorType搭配使用时，有一些注意点，见下

- @XmlAccessorType

  作用域：类，包（不常用）

  告诉解析器，在解析XML时要如何获取类的字段属性，有4个枚举类型：

  | 枚举类型                            | 访问方式                            |
  | ------------------------------- | ------------------------------- |
  | XmlAccessType.FIELD             | 成员变量                            |
  | XmlAccessType.PROPERTY          | public getter,setter            |
  | XmlAccessType.PUBLIC_MEMBER（默认） | public getter,setter+public成员变量 |
  | XmlAccessType.NONE              | 必须显示指定@XmlElement               |

  我们上述的例子中，使用的方式是在类上配置@XmlAccessorType(XmlAccessType.FIELD)，基于成员变量访问属性，并且，在每一个成员变量之上都显示指定了name=xxx；而如果配置@XmlAccessorType(XmlAccessType.PUBLIC_MEMBER)即默认配置，则你需要将@XmlElement注解写在getter方法上,笔者比较习惯例子中的写法。需要注意点的一点是，如果@XmlAccessorType与@XmlElement的配置不对应，很容易触发自动的转换方式，会导致某个节点出现两次的异常。

- @XmlJavaTypeAdapter

  作用域：字段,方法,类,包,参数（前三者常用）

  java内置的xml日期转换类不能满足我们的需求（可以动手试试看默认日期的格式是什么），以及遇到自定义的类，需要配置转换器，就可以使用这个注解，@XmlJavaTypeAdapter注解接收一个自定义的Adapter，需要继承自`XmlAdapter<ValueType,BoundType>`抽象类，一个常用的日期转化适配器如下：

  ```java
  public class DateAdapter extends XmlAdapter<String, Date> {

      static ThreadLocal<DateFormat> sdf ;

      static {
          sdf =new ThreadLocal<DateFormat>() {
              @Override
              protected DateFormat initialValue() {
                  return new SimpleDateFormat("yyyy-MM-dd hh:mm:ss");
              }
          };
      }

      @Override
      public Date unmarshal(String v) throws Exception {
          return sdf.get().parse(v);
      }

      @Override
      public String marshal(Date v) throws Exception {
          return sdf.get().format(v);
      }
  }
  ```

  使用Adapter的弊端也很明显，一个适配器只能对应一个日期的格式，在实际开发中我们往往会将日期区分成天维度的日期和秒维度的日期，不能像大多数JSON那样拥有灵活的注解，如果有读者有想到好的解决方案，欢迎跟我沟通。涉及到日期格式转化，时刻不要忘记SimpleDateFormat线程不安全这一点。

- @XmlElementWrapper

  XML中表示集合时，在最外层通常会有一个Xxxs或者XxxList这样的标签，可以通过@XmlElementWrapper实现，其中name就代表额外添加的包裹信息是什么,如上文的OrderItems。

## 一些其他的转换工具类

我们主要任务是实现XML字符串和javabean之间转换，不是解析XML，所以dom4j一类的类库不用考虑。熟悉spring的人会了解到一点，spring其实已经封装了xml转换相关的类，即`org.springframework.oxm.jaxb.Jaxb2Marshaller`这个类，他的顶层接口是`org.springframework.oxm.Marshaller`和`org.springframework.oxm.UnMarshaller`。而在java规范中，也存在同名的接口：`javax.xml.bind.Marshaller`,`javax.xml.bind.UnMarshaller`，这点在使用中需要注意下。笔者的建议是，这种数据格式转换操作，应当尽量引入最少的依赖。所以使用javax的类库下的相关方法进行封装。上述的工具类，仅仅只需要引入javax包，即可使用了。非常方便、