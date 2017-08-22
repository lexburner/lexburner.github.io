---
title: 一个DDD指导下的实体类设计案例
date: 2017-08-21 15:59:52
tags: 
- 领域驱动设计
categories: 
- 领域驱动设计
---

## 1 引子

项目开发中的工具类代码总是随着项目发展逐渐变大，在公司诸多的公用代码中，笔者发现了一个简单的，也是经常被使用的类：BaseDomain，引起了我的思考。
在我们公司的开发习惯中，数据库实体类通常会继承一个叫做BaseDomain的类，这个类很简单，主要用来填充一些数据库实体公用的属性，它的设计如下：
<!--more-->
```java
@MappedSuperclass <1>
public class BaseDomain {
    
    private Boolean deleteFlag; <2>
    private Date deleteDate;
    private Date lastUpdateDate;
    private Date createDate;
    @Version <3>
    private Integer version;
    
    @PrePersist <4>
    public void init(){
        Date now = new Date();
        deleteFlag = false;
        createDate = lastUpdateDate = now;
    }
    
    @PreUpdate <4>
    public void update(){
        lastUpdateDate = new Date();
    }
    
}
```

小小的一个类其实还是蕴含了不少的知识点在里面，至少可以包含以下几点：

<1> 被其他类继承后，父类的字段不会被忽略，也就意味着子类没有必要自己写这一堆公用的属性了。

<2> 逻辑删除标识，业务类的删除必须是这种打标识的行为，不能进行物理删除。值得一提的是，公司原先的该字段被命名成了isDelete，这不符合变量命名的规范，会导致一些序列化框架出现问题，而delete是数据库的保留字，所以本文中用deleteFlag。

<3> 使用version作为乐观锁的实现，version的自增以及版本失效异常受@Version该注解的影响，是由框架控制的。

<4> 创建日期，更新日期等等属性，在我们使用JPA的save方法后，框架会自动去填充相应的值。

## 2 发现问题与解决问题

这个基类使用的频次是怎么样的呢？every class！是的，公司的每个开发者在新增一个实体类时总是优先写上`Xxx extends BaseDomain` 。初级开发者总是有什么学什么，他们看到公司原来的代码都是会继承这个类，以及周围的同事也是这么写着，他们甚至不知道version乐观锁的实现，不知道类的创建日期更新日期是在基类中被声明的；高级开发者能够掌握我上面所说的那些技术要点，尽管开发中因此遇到一些不适，但也是尽可能的克服。
等等，上面说到添加这个基类后，对开发造成了不适感，这引起了我的思考，下面就来谈谈直观的有哪些不适感以及解决方案。

#### 2.1 没有物理删除，只有逻辑删除

真正delete操作不会再出现了,物理删除操作被setDeleteFlag(true)代替。在列表展示中，再也不能使用findAll()操作了，而是需要使用findByDeleteFlagFalse()。更多的数据库查询操作，都要考虑到，deleteFlag=true的那些记录，不应该被影响到。

**解决问题**：在DDD中，值得推崇的方式是使用specification模式来解决这个问题，对应到实际开发中，也就是JPA的Predicate，或者是熟悉Hibernate的人所了解的Criteria。但不可避免的一点是由于只有逻辑删除，导致了我们的数据库越来越大（解决方法不是没有，正是EventSouring+CQRS架构，这属于DDD的高级实践，本文不进行讨论）。从技术开发角度出发，这的确使得我们的编码变得稍微复杂了一点，但是其业务意义远大于这点开发工作量，所以是值得的。


#### 2.2 级联查询变得麻烦

一个会员有多个通信地址，多个银行卡。反映到实体设计，便是这样的：


```java
public class Member extends BaseDomain{
  
  private String username;

  @OneToMany
  private List<MemberAddress> memberAddresses;

  @OneToMany
  private List<BankCard> bankCards;
    
}
```

其中，MemberAddress及BankCard都继承了BaseDomain。使用orm框架自带的级联功能，我们本可以查询出会员信息时，顺带查出其对应的通讯地址列表和银行卡列表。但现在不是那么的美好了，使用级联查询，可能会查询出已经被删除的MemberAddress，BankCard，只能在应用层进行deleteFlag的判断，从而过滤被删除的信息，这无法避免，因为框架不认识逻辑删除标识！

**解决问题**：这个问题和2.3节的问题，恰恰是促成我写这篇文章的初衷，这与DDD有着密不可分的关联。DDD将对象划分成了entity（实体）和value object（值对象）。如果仔细分析下上面的业务并且懂一点DDD，你会立刻意识到。Member对象就是一个entity，而MemberAddress以及BankCard则是value object（username也是value object）。value object的一个重要特点，就是作为entity的修饰，从业务角度出发，MemberAddress和BankCard的确是为了更好描述Member信息，而抽象出的一个集合。而value object的另一特性，不可变性，指导了我们，**不应该让MemberAddress，BankCard继承BaseDomain**。说了这么多，就是想从一个理论的高度，让那些设计一个新实体便继承BaseDomain的人戒掉这个习惯。在value object丧失了deleteFlag，lastUpdateDate等属性后，可能会引发一些的质疑，他们会声称：“数据库里面member_address这张表没有lastUpdateDate字段了，我再也无法得知这条会员地址最后修改的时间了!”。是的，前面已经强调过了，value object是对entity的一种修饰，修改了会员地址，变化的应该是会员这个整体，也就是说lastUpdateDate应该反映到Member上。实际的开发经验告诉我，从前那么多的value object继承了BaseDomain，99%不会使用到其中的相关属性，如果真的需要使用，那么请单独为类添加，而不是继承BaseDomain。其次这些人犯了另一个错误，我们设计一个系统时，应该是entity first，而不应该database first。DDD告诉我们一个软件开发的大忌，到现在2017年，仍然有大帮的人在问：“我要实现xxxx功能，我的数据库应该如何设计？”这些人犯了根本性的错误，就是把软件的目的搞错了，软件研究的是什么？是研究如何使用计算机来解决实际（领域）问题，而不是去研究数据应该如何保存更合理。我的公司中有不少的程序员新人，希望这番话能够帮助那些“步入歧途”的从业人员 “走上正路”。软件设计应该从“数据库驱动”走向“领域驱动”，而DDD的实践经验正是为设计和开发大型复杂的软件系统提供了实践指导。

#### 2.3 乐观锁的尴尬地位

再说回BaseDomain中的version字段，由于MemberAddress和BankCard这样的value object也被赋予了乐观锁的行为，这意味着加锁的粒度变小了。DDD的指导下，改动也可以理解为由Member这个根发出，统一由Member中的version来控制，这使锁的粒度变大了。换言之，从技术开发角度，对value object加上version可以允许同时（操作系统级别真正的同时）修改一个用户的地址信息和银行卡信息，甚至是多个银行卡中不同的银行卡，而单独由Member控制，则意味着，系统在同一时刻只能进行单独一项操作。在业务并发的一般角度上考虑，一个用户是不会出现多线程修改行为的。而从软件设计的角度，单独为value object 添加version，破坏了value object的不可变性，若要修改，应当是被整个替换。

**解决方案**：在一般情况下，请不要为value object添加乐观锁。如果有一个场景下，你的value object需要出现版本控制，那可能有两种情况：1 你的value object是压根不是value object，可能是一个entity 2 聚合根划分错误 ....这，要真是这样源头都弄错了，压根没法聊了对吧

## 3 总结

BaseDomain这样的设计本身并不是我想要强调的重点，但是既然出现了BaseDomain这样的设计，那么它究竟应该被什么样的实体继承，就是需要被考虑的了。DDD下，识别aggregate root，entity，value object，是整个软件设计的核心点，在本文中，判别是否继承BaseDomain的前提，就是这个对象是entity，还是value object。大家都是存在数据库中的，但是地位是不一样的。

本文若有什么不足之处，欢迎DDD爱好者指出。

