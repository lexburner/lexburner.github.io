---
title:  drools 用户指南 ----Cross Products
date: 2017-04-11 13:44:54
tags: 
- 规则引擎
- drools
categories: 
- 工具
toc: true
---



## Cross Products ##
之前提到“Cross Products”一词，其实就是一个 join 操作（译者注：可以理解为笛卡尔积）。想象一下，火灾报警示例的数据与以下规则结合使用，其中没有字段约束：

```java
rule "Show Sprinklers" when
    $room : Room()
    $sprinkler : Sprinkler()
then
    System.out.println("room:" + $room.getName() +
                        "sprinkler:" + $sprinkler.getRoom().getName() );
end
```
在 SQL 术语中，这就像是执行了 select * from Room, Sprinkler，Sprinkler 表中的每一行将与 Room 表中的每一行相连接，从而产生以下输出：

<!-- more -->

```java
room:office sprinkler:office
room:office sprinkler:kitchen
room:office sprinkler:livingroom
room:office sprinkler:bedroom
room:kitchen sprinkler:office
room:kitchen sprinkler:kitchen
room:kitchen sprinkler:livingroom
room:kitchen sprinkler:bedroom
room:livingroom sprinkler:office
room:livingroom sprinkler:kitchen
room:livingroom sprinkler:livingroom
room:livingroom sprinkler:bedroom
room:bedroom sprinkler:office
room:bedroom sprinkler:kitchen
room:bedroom sprinkler:livingroom
room:bedroom sprinkler:bedroom
```
这些连接结果显然会变得巨大，它们必然包含冗余数据。 cross products 的大小通常是新规则引擎产品性能问题的根源。 从这可以看出，我们希望约束 cross products，这便是用可变约束（the variable constraint）完成的。

```java
rule
when
    $room : Room()
    $sprinkler : Sprinkler(room == $room)
then
    System.out.println("room:" + $room.getName() +
                        "sprinkler:" + $sprinkler.getRoom().getName() );
end
```
这就使得筛选结果只有寥寥几行, 这就为每一个 Room 筛选出了正确的 Sprinkler. 在 sql 中 (实际上是 HQL) 这样的查询约等于 `select * from Room, Sprinkler where Room == Sprinkler.room`.

