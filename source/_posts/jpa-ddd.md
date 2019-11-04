---
title: JAVA 拾遗 --JPA 二三事
date: 2018-02-14 22:18:51
tags:
- JAVA
categories:
- JAVA
---

记得前几个月，spring4all 社区刚搞过一次技术话题讨论：如何对 JPA 或者 MyBatis 进行技术选型？传送门：http://www.spring4all.com/article/391 由于平时工作接触较多的是 JPA，所以对其更熟悉一些，这一篇文章记录下个人在使用 JPA 时的一些小技巧。补充说明：JPA 是一个规范，本文所提到的 JPA，特指 spring-data-jpa。

tips：** 阅读本文之前，建议了解值对象和实体这两个概念的区别。**

## 使用 @Embedded 关联一对一的值对象

现实世界有很多一对一的关联关系，如人和身份证，订单和购买者... 而在 JPA 中表达一对一的关联，通常有三种方式。下面就以订单（Order）和购买者（CustomerVo）为例来介绍这三种方式，这里 CustomerVo 的 Vo 指的是 Value Object。

** 字段平铺 **

这可能是最简单的方式了，由于一对一关联的特殊性，完全可以在 Order 类中，使用几个字段记录 CustomerVo 的属性。

```java
public class Order {
    /* 其他字段 */
    ...
    /* Customer 相关字段 */
    private int customerId;
    private String customerName;
    private String customerMobile;
}
```

实际上大多数人就是这么做的，甚至都没有意识到这三个字段其实是属于同一个实体类。这种形式优点是很明显的：简单；缺点也是很明显的，这不符合 OO 的原则，且不利于统一检索和维护 CustomerVo 信息。

** 使用 @OneToOne**

```java
public class Order {
    @OneToOne
    private CustomerVo customerVo;
}
```

这么做的确更“面向对象”了，但代价似乎太大了，我们需要在数据库中额外维护一张 CustomerVo 表，关联越多，代码处理起来就越麻烦，得不偿失。

** 使用 @Embedded**

那有没有能中和上述矛盾的方案呢？引出 @Embedded 这个注解。分析下初始需求，我们发现：CustomerVo 仅仅是作为一个值对象，并不是一个实体（这里牵扯到一些领域驱动设计的知识，值对象的特点是：作为实体对象的修饰，即 CustomerVo 这个整体是 Order 实体的一个属性；不变性，CustomerVo 一旦生成后便不可被修改，除非被整体替换）

@Embedded 注解便是内嵌值对象最好的表达形式。

```java
@Entity
public class Order {
    @Embedded
    private CustomerVo customerVo;
}
```

```java
@Embeddable
public class CustomerVo {
    private int customerId;
    private String customerName;
    private String customerMobile;
}
```

Order 拥有 @Entity 注解，表明其是 DDD 中的实体；而 CustomerVo 拥有 @Embeddable 注解，表明其是 DDD 中的值对象。这也是为什么我一直在表达这样一种观点：JPA 是对 DDD 很好的实践的。

关于实体类的设计技巧，在曹祖鹏老师的 github 中可以看到很成熟的方案，可能会颠覆你对实体类设计的认知：https://github.com/JoeCao/qbike/。

## 使用 @Convert 关联一对多的值对象 

说到一对多，第一反应自然是使用 @OneToMany 注解。的确，我自己在项目中也主要使用这个注解来表达一对多的关联，但这里提供另一个思路，来关联一对多的值对象。

以商品和商品组图来举例。

** 使用 @OneToMany**

还是先想想我们原来会怎么做，保存一个 List<String>, 一种方式是这样

```java
public class Goods {
    // 以逗号分隔
    private String pictures;
}
```

使用字符串存储，保存成 JSON 数组的形式，或者以逗号分隔都行。

如果图片还要保存顺序，缩略图，那就必须要得使用一对多的关联了。

```java
@Entity
public class Goods {
    @OneToMany
    private List<GoodsPicture> goodsPictures;
}
```

```java
@Entity
public class GoodsPicture {
    private String path;
    private Integer index;
    private String thumbnail;
}
```

我们应当发现这样的劣势是什么，从设计的角度来看：我们并不想单独为 GoodsPicture 单独建立一张表，正如前面使用 String pictures 来表示 List<String> 一样，这违反了数据库设计的第一范式，但这对于使用者来说非常方便，** 这是关系型数据库的表达能力有限而进行的妥协 ** 。关于这一点我曾和芋艿，曹大师都进行过讨论，并达成了一致的结论：数据库中可以保存 JSON，使用时在应用层进行转换。

** 使用 JSON 存储复杂对象 **

```java
@Entity
public class Goods {
    /**
     * 图片 JSON
     * {@link GoodsPicture}
     */
    @Column(columnDefinition = "text")
    private String goodsPictures;
}
```

** 使用 @Convert**

上述的 String 使得在数据库层面少了一张表，使得 Goods 和 GoodsPictures 的关联更容易维护，但也有缺点：单纯的 String goodsPictures 对于使用者来说毫无含义，必须经过应用层的转换才可以使用。而 JPA 实际上也提供了自定义的转换器来帮我们自动完成这一转换工作，这便到了 @Convert 注解派上用场的时候了。

1 声明 Convert 类

```java
@Entity
public class Goods {
    @Convert(converter = PicturesWrapperConverter.class)
    @Column(columnDefinition = "text")
    private PicturesWrapper picturesWrapper;
}
```

2 设置转换类  PicturesWrapperConverter

```java
public class PicturesWrapperConverter implements AttributeConverter<PicturesWrapper, String> {
    @Override
    public String convertToDatabaseColumn(PicturesWrapper picturesWrapper) {
        return JSON.toJSONString(picturesWrapper);
    }
    @Override
    public PicturesWrapper convertToEntityAttribute(String dbData) {
        return JSON.parseObject(dbData, PicturesWrapper.class);
    }
}
```

PicturesWrapperConverter 实现了 AttributeConverter<X,Y> 接口，它表明了如何将 PicturesWrapper 转换成 String 类型。这样的好处是显而易见的，对于数据库而言，它知道 String 类型如何保存；对于 Goods 的使用者而言，也只关心 PicturesWrapper 的格式，并不关心它如何持久化。

```java
public class PicturesWrapper {
    List<GoodsPicture> goodsPictures;
}
```

对于 List 的保存，我暂时只找到了这种方式，借助一个 Wrapper 对象去存储一个 List 对象。没有找到直接持久化 List 的方式，如果可以实现这样的方式，会更好一些：

```java
@Entity
public class Goods {
    @Convert(converter = SomeConverter.class)
    @Column(columnDefinition = "text")
    List<GoodsPicture> goodsPictures;
}
```

但 converter 无法获取到 List 的泛型参数 GoodsPicture，在实践中没找到方案来解决这一问题，只能退而求其次，使用一个 Wrapper 对象。

与 OneToMany 对比，这样虽然使得维护变得灵活，但也丧失了查找的功能，我们将之保存成了 JSON 的形式，导致其不能作为查询条件被检索。

## 使用 orphanRemoval 来删除值对象

你可能有两个疑问：1 在实际项目中，不是不允许对数据进行物理删除吗？ 2 删除对象还不简单，JPA 自己不是有 delete 方法吗？

关于第一点，需要区分场景，一般实体不允许做物理删除，而是用标记位做逻辑删除，也有部分不需要追溯历史的实体可以做物理删除，而值对象一般而言是可以做物理删除的，因为它只是属性而已。

第二点就有意思了，delete 不就可以直接删除对象吗，为什么需要介绍 orphanRemoval  呢？

以活动和礼包这个一对多的关系来举例。

```java
@Entity
public class Activity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, mappedBy = "activity")
    private List<GiftPackVo> giftPackVos;
}
```

```java
@Entity
public class GiftPackVo {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;
    private String name;
    @ManyToOne
    @JoinColumn(name = "activity_id")
    private Activity activity;
}
```

这是一个再简单不过的一对多关系了，唯一可能觉得陌生的便是这个属性了 orphanRemoval = true 。

如果想要删除某个活动下的某个礼包，在没有 orphanRemoval 之前，你只能这么做：

GiftPackVoRepository.delete(GiftPackVo);

但其实这违反了 DDD 中的聚合根模式，GiftPackVo 只是一个值对象，其不具备实体的生命周期，删除一个礼包其实是一个不准确的做法，应当是删除某一个活动下的某一个礼包，对礼包的维护，应当由活动来负责。也就是说：应该借由 Activity 删除 GiftPackVo。使用 orphanRemoval 便可以完成这一操作，它表达这样的含义：内存中的某个 Activity 对象属于持久化态，对 List<GiftPackVo> 的移除操作，将被直接认为是删除操作。

于是删除某个“name = 狗年新春大礼包”的礼包便可以这样完成：

```java
Activity activity = activityRepository.findOne(1);
activity.getGiftPackVos().removeIf(giftPackVo -> "狗年新春大礼包".equals(giftPackVo.getName()));
activityRepository.save(activity);
```

整个代码中只出现了 activityRepository 这一个仓储接口。

## 使用 @Version 来实现乐观锁

乐观锁一直是保证并发问题的一个有效途径，spring data jpa 对 @Version 进行了实现，我们给需要做乐观锁控制的对象加上一个 @Version 注解即可。

```
@Entity
public class Activity {
    @Version
    private Integer version;
}
```

我们在日常操作 Activity 对象时完全不需要理会 version 这个字段，当做它不存在即可，spring 借助这个字段来做乐观锁控制。每次创建对象时，version 默认值为 0，每次修改时，会检查对象获取时和保存时的 version 是否相差 1，转化为 sql 便是这样的语句：**update activity set xx = xx,yy = yy,version= 10 where id = 1 and version = 9;** 然后通过返回影响行数来判断是否更新成功。

** 测试乐观锁 **

```
@Service
public class ActivityService {
    @Autowired
    ActivityRepos activityRepos;

    public void test(){
        Activity one = activityRepos.findOne(1);
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        one.setName("xx"+ new Random().nextInt());
        activityRepos.save(one);
    }
}
```

当 test 方法被并发调用时，可能会存在并发问题。控制台打印出了更新信息

```
2018-02-14 23:44:25.373  INFO 16256 --- [nio-8080-exec-2] jdbc.sqltiming                           : update activity set name='xx-1863402614', version=1 
where id=1 and version=0 
2018-02-14 23:44:25.672  INFO 16256 --- [nio-8080-exec-4] jdbc.sqltiming                           : update activity set name='xx-1095770865', version=1 
where id=1 and version=0 
org.hibernate.StaleStateException: Batch update returned unexpected row count from update [0]; actual row count: 0; expected: 1
```

表面上看出现的是 StaleStateException，但实际捕获时，如果你想 catch 该异常，根本没有效果，通过 debug 信息，可以发现，真正的异常其实是 ObjectOptimisticLockingFailureException（以 Mysql 为例，实际可能和数据库方言有关，其他数据库未测试）。

```java
@RequestMapping("/test")
public void test(){
    try{
        activityService.test();
    }catch (ObjectOptimisticLockingFailureException oolfe){
        System.out.println("捕获到乐观锁并发异常");
        oolfe.printStackTrace();
    }
}
```

在 Controller 层尝试捕获该异常，控制输出如下：

```
捕获到乐观锁并发异常
org.springframework.orm.ObjectOptimisticLockingFailureException: Batch update returned unexpected row count from update [0]; actual row count: 0; expected: 1; nested exception is org.hibernate.StaleStateException: Batch update returned unexpected row count from update [0]; actual row count: 0; expected: 1
```

成功捕获到了并发冲突，这一切都是 @Version 帮我们完成的，非常方便，不需要我们通过编码去实现乐观锁。

## 总结

本文简单聊了几个个人感触比较深的 JPA 小技巧，JPA 真的很强大，也很复杂，可能还有不少“隐藏”的特性等待我们挖掘。它不仅仅是一个技术框架，本文的所有内容即使不被使用，也无伤大雅，但在领域驱动设计等软件设计思想的指导下，它完全可以实践的更好。
