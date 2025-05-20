---
title: 鱼和熊掌兼得：同时使用 JPA 和 Mybatis
date: 2020-11-12 12:30:01
tags:
- JAVA
categories:
- JAVA
toc: true
---

## 前言

JPA 和 Mybatis 的争论由来已久，还记得在 2 年前我就在 spring4all 社区就两者孰优孰劣的话题发表了观点，我当时是力挺 JPA 的，这当然跟自己对 JPA 熟悉程度有关，但也有深层次的原因，便是 JPA 的设计理念契合了领域驱动设计的思想，可以很好地指导我们设计数据库交互接口。这两年工作中，逐渐接触了一些使用 Mybatis 的项目，也对其有了一定新的认知。都说认知是一个螺旋上升的过程，随着经验的累积，人们会轻易推翻过去，到了两年后的今天，我也有了新的观点。本文不是为了告诉你 JPA 和 Mybatis 到底谁更好，而是尝试求同存异，甚至是在项目中同时使用 JPA 和 Mybatis。什么？要同时使用两个 ORM 框架，有这个必要吗？别急着吐槽我，希望看完本文后，你也可以考虑在某些场合下同时使用这两个框架。

ps. 本文讨论的 JPA 特指 spring-data-jpa。

<!-- more -->

## 建模

```java
@Entity
@Table(name = "t_order")
public class Order {
  
  @Id
  private String oid;
  
  @Embedded
  private CustomerVo customer;
  
  @OneToMany(cascade = {CascadeType.ALL}, orphanRemoval = true, fetch = FetchType.LAZY, mappedBy = "order")
  private List<OrderItem> orderItems;
}
```

JPA 最大的特点是 sqlless，如上述的实体定义，便将数据库的表和 Java 中的类型关联起来了，JPA 可以做到根据 @Entity 注解，自动创建表结构；基于这个实体实现的 Repository 接口，又使得 JPA 用户可以很方便地实现数据的 CRUD。所以，使用 JPA 的项目，人们很少会提到”数据库设计“，人们更关心的是领域建模，而不是数据建模。

```xml
<generatorConfiguration>
    <context id="my" targetRuntime="MyBatis3">
      
      <jdbcConnection driverClass="com.mysql.jdbc.Driver" connectionURL=""
           userId="" password=""/>

      <javaModelGenerator targetPackage="" targetProject="" />

      <sqlMapGenerator targetPackage="" targetProject="" />

      <javaClientGenerator targetPackage="moe.cnkirito.demo.mapper" />
      
      <table tableName="t_order" domainObjectName="Order" />


    </context>
</generatorConfiguration>
```

Mybatis 用户更多使用的是逆向工程，例如 mybatis-generator 插件根据如上的 xml 配置，便可以直接将表结构转译成 mapper 文件和实体文件。

code first 和 table first 从结果来看是没有区别的，差异的是过程，所以设计良好的系统，并不会仅仅因为这个差异而高下立判，但从指导性来看，无疑设计系统时，更应该考虑的是实体和实体，实体和值对象的关联，领域边界的划分，而不是首先着眼于数据库表结构的设计。

建模角度来看，JPA 的领域建模思想更胜一筹。

## 数据更新

聊数据库自然离不开 CRUD，先来看增删改这些数据更新操作，来看看两个框架一般的习惯是什么。

JPA 推崇的数据更新只有一种范式，分成三步：

1. 先 findOne 映射成实体
2. 内存内修改实体
3. 实体整体 save

你可能会反驳我说，@Query 也存在 nativeQuery 和 JPQL 的用法，但这并不是主流用法。JPA 特别强调”整体 save“的思想，这与领域驱动设计所强调的有状态密不可分，即其认为，修改不应该是针对于某一个字段：”update table set a=b where colomonA=xx“ ，而应该反映成实体的变化，save 则代表了实体状态最终的持久化。

先 find 后 save 显然也适用于 Mybatis，而 Mybatis 的灵活性，使得其数据更新方式更加地百花齐放。路人甲可以认为 JPA 墨守成规不懂变通，认为 Mybatis 不羁放纵爱自由；路人乙也可以认为 JPA 格式规范易维护，Mybatis 不成方圆。这点不多加评判，留后人说。

从个人习惯来说，我还是偏爱先 find 后整体 save 这种习惯的，不是说这是 JPA 的专利，Mybatis 不具备；而是 JPA 的强制性，让我有了这个习惯。 

数据更新角度来看，JPA 强制使用 find+save，mybatis 也可以做到这一点，胜者：无。

## 数据查询

JPA 提供的查询方式主要分为两种

1. 简单查询：findBy + 属性名
2. 复杂查询：JpaSpecificationExecutor

简单查询在一些简单的业务场景下提供了非常大的便捷性，findBy + 属性名可以自动转译成 sql，试问如果可以少写代码，有谁不愿意呢？

复杂查询则是 JPA 为了解决复杂的查询场景，提供的解决方案，硬是把数据库的一些聚合函数，连接操作，转换成了 Java 的方法，虽然做到了 sqlless，但写出来的代码又臭又长，也不见得有多么的易读易维护。这算是我最不喜欢 JPA 的一个地方了，但要解决复杂查询，又别无他法。

而 Mybatis 可以执行任意的查询 sql，灵活性是 JPA 比不了的。数据库小白搜索的最多的两个问题：

1. 数据库分页怎么做
2. 条件查询怎么做

 Mybatis 都可以轻松的解决。

千万不要否认复杂查询：如聚合查询、Join 查询的场景。令一个 JPA 用户抓狂的最简单方式，就是给他一个复杂查询的 case。

```sql
select a,b,c,sum(a) where a=xx and d=xx group by a,b,c;
```

来吧，展示。可能 JPA 的确可以完成上述 sql 的转义，但要知道不是所有开发都是 JPA 专家，没人关心你用 JPA 解决了多么复杂的查询语句，更多的人关心地是，能不能下班前把这个复杂查询搞定，早点回家。

在回到复杂数据查询需求本身的来分析下。我们假设需求是合理的，毕竟项目的复杂性难以估计，可能有 1000 个数据查询需求 JPA 都可以很方便的实现，但就是有那么 10 几个复杂查询 JPA hold 不住。这个时候你只能乖乖地去写 sql 了，如果这个时候又出现一个条件查询的场景，出现了 if else 意味着连 @Query 都用不了，完全退化成了 JdbcTemplate 的时代。

那为什么不使用 Mybatis 呢？Mybatis 使用者从来没有纠结过复杂查询，它简直就是为之而生的。

如今很多 Mybatis 的插件，也可以帮助使用者快速的生成基础方法，虽然仍然需要写 sql，但是这对于开发者来说，并不是一件难事。

不要质疑高并发下，JOIN 操作和聚合函数存在的可能性，数据查询场景下，Mybatis 完胜。

## 性能

本质上 ORM 框架并没有性能的区分度，因为最终都是转换成 sql 交给数据库引擎去执行，ORM 层面那层性能损耗几乎可以忽略不计。

但从实际出发，Mybatis 提供给了开发者更高的 sql 自由度，所以在一些需要 sql 调优的场景下会更加灵活。

## 可维护性

前面我们提到 JPA 相比 Mybatis 丧失了 sql 的自由度，凡事必有 trade off，从另一个层面上来看，其提供了高层次的抽象，尝试用统一的模型去解决数据层面的问题。sqlless 同时也屏蔽了数据库的实现，屏蔽了数据库高低版本的兼容性问题，这对可能存在的数据库迁移以及数据库升级提供了很大的便捷性。

## 同时使用两者

其他细节我就不做分析了，相信还有很多点可以拿过来做对比，但我相信主要的点上文都应该有所提及了。进行以上维度的对比并不是我写这篇文章的初衷，更多地是想从实际开发角度出发，为大家使用这两个框架提供一些参考建议。

在大多数场景下，我习惯使用 JPA，例如设计领域对象时，得益于 JPA 的正向模型，我会优先考虑实体和值对象的关联性以及领域上下文的边界，而不用过多关注如何去设计表结构；在增删改和简单查询场景下，JPA 提供的 API 已经是刻在我 DNA 里面的范式了，使用起来非常的舒服。

在复杂查询场景下，例如

1. 包含不存在领域关联的 join 查询
2. 包含多个聚合函数的复杂查询
3. 其他 JPA 较难实现的查询

我会选择使用 Mybatis，有点将 Mybatis 当做数据库视图生成器的意味。坚定不移的 JPA 拥趸者可能会质疑这些场景的存在的真实性，会质疑是不是设计的漏洞，但按照经验来看，哪怕是短期方案，这些场景也是客观存在的，所以听我一言，尝试拥抱一下 Mybatis 吧。

随着各类存储中间件的流行，例如 mongodb、ES，取代了数据库的一部分地位，重新思考下，本质上都是在用专业的工具解决特定场景的问题，最终目的都是为了解放生产力。数据库作为最古老，最基础的存储组件，的确承载了很多它本不应该承受的东西，那又何必让一个工具或者一个框架成为限制我们想象力的沟壑呢？

两个框架其实都不重，在 springboot 的加持下，引入几行配置就可以实现两者共存了。

我自己在最近的项目中便同时使用了两者，遵循的便是本文前面聊到的这些规范，我也推荐给你，不妨试试。
