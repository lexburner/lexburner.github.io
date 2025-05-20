---
title: 警惕不规范的变量命名
date: 2017-09-23 13:45:56
tags:
- JAVA
- 技术杂谈
categories:
- 技术杂谈
toc: true
---

就在最近，项目组开始强调开发规范了，今天分享一个变量名命名不规范的小案例，强调一下规范的重要性。例子虽小，但却比较有启发意义。

## Boolean 变量名命名规范

16 年底，阿里公开了《Java 开发规范手册》，其中有一条便是“布尔类型不能以 is 为前缀”。规范中没有举出例子，但是给出了原因：会导致部分序列化框架的无法解析。

看看错误的示范，会导致什么问题，以 Spring 中的 jdbcTemplate 来进行实验。

<!-- more -->

### 定义实体类

```java
@Entity
public class Bar {
    @Id
    @GeneratedValue
    private Integer id;
    private Boolean isSuccess;// 注意这是错误的命名
    private boolean isSend;// 注意这是错误的命名
    public Boolean getSuccess() {
        return isSuccess;
    }
    public void setSuccess(Boolean success) {
        isSuccess = success;
    }
    public boolean isSend() {
        return isSend;
    }
    public void setSend(boolean send) {
        isSend = send;
    }
}
```

其中，isSuccess 使用的是包装类型 Boolean，而 isSend 使用的是原生类型 boolean，而 getter，setter 方法是使用 Intellij IDEA 自动生成的，布尔类型生成 getter，setter 方法时略微特殊，比如原生类型的 getter 方式是以 is 开头的，他们略微有点区别，注意区分。生成 getter，setter 方法之后，其实已经有点奇怪了，不急，继续下面的实验。

在数据库中，isSuccess 被映射了 is_success，isSend 被映射成了 is_send，这符合我们的预期。并且为了后续的实验，我们事先准备一条记录，用于后续的查询，在 mysql 的方言中，布尔类型被默认自动映射成 byte，1 代表 ture，0 代表 false。

| id   | is_success | is_send |
| ---- | ---------- | ------- |
| 1    | 1          | 1       |

### 使用 JdbcTemplate 查询

```java
public void test(String id) {
    RowMapper<Bar> barRowMapper = new BeanPropertyRowMapper<Bar>(Bar.class);
    Bar bar = jdbcTemplate.queryForObject("select * from bar where id = ?", new Object[]{id}, barRowMapper);
    System.out.println(bar);
}
```

JdbcTemplate 提供了 BeanPropertyRowMapper 完成数据库到实体类的映射，事先我重写了 Bar 类的 toString 方法，调用 `test(1)` 看看是否能成功映射。结果如下：

```java
Bar{id=1, isSuccess=null, isSend=false}
```

数据库中是实际存在这样的字段，并且值都是 true，而使用 JdbcTemplate，却查询不到这样的问题，这边是不遵循规范导致的问题。

相信这个例子可以让大家更加加深映像，特别是在维护老旧代码时，如果发现有 is 开头的 boolean 值，需要额外地注意。

## 包装类型与原生类型

在回顾一下上述的 demo，原生类型和包装类型都没有封装成功，isSuccess 得到了一个 null 值，isSend 得到了一个 false 值。后者足够引起我们的警惕，如果说前者会引起一个 NullPointerExcepiton 导致程序异常，还可以引起开发者的注意，而后者很有可能一直作为一个隐藏的 bug，不被人所察觉，因为 boolean 的默认值为 false。

在类变量中，也普遍提倡使用包装类型，而原生类型的不足之处是很明显的。以 Integer num; 字段为例，num=null 代表的含义是 num 字段未被保存，未定义；而 num=0 代表的含义是明确的，数量为 0。原生类型的表达能力有限。所以提倡在局部作用域的计算中使用原生类型，而在类变量中使用包装类型。

## JavaBean 规范

如今的微服务的时代，都是在聊架构，聊容器编排，竟然还有人聊 JavaBean，但既然说到了规范，顺带提下。

先来做个选择题，以下选项中符合 JavaBean 命名规范的有哪些？：

```
A : ebook
B : eBook
C : Ebook
D : EBook
```

.

.

.

.

正确答案是：A,D

怎么样，符合你的预想吗？JavaBean 规范并不是像很多人想的那样，首字母小写，之后的每一个单词首字母大写这样的驼峰命名法。正确的命名规范应该是：要么前两个字母都是小写，要么前两个字母都是大写。因为英文单词中有 URL，USA 这样固定形式的大写词汇，所以才有了这样的规范。特别警惕 B 那种形式，一些诸如 sNo，eBook,eMail,cId 这样的命名，都是不规范的。

由此引申出了 getter，setter 命名的规范，除了第一节中 Boolean 类型的特例之外，网上还有不上文章，强调了这样的概念：eBook 对应的 getter，setter 应当为 geteBook(),seteBook()，即当类变量的首字母是小写，而第二个字母是大写时，生成的 getter，setter 应当是（get/set）+ 类变量名。但上面已经介绍过了，eBook 这样的变量命名本身就是不规范的，在不规范的变量命名下强调规范的 getter，setter 命名，出发点就错了。有兴趣的朋友可以在 eclipse，intellij idea 中试试，这几种规范，不规范的变量命名，各自对应的 getter，setter 方法是如何的。另外需要知晓一点，IDE 提供的自动生成 getter，setter 的机制，以及 lombok 这类框架的机制，都是由默认的设置，在与其他反射框架配合使用时，只有双方都遵循规范，才能够配合使用，而不能笃信框架。这一点上，有部分国产的框架做的并不是很好。

最后说一个和 JavaBean 相关的取值规范，在 jsp 的 c 标签，freemarker 一类的模板语法，以及一些 el 表达式中，${student.name} 并不是取的 student 的 name 字段，而是调用了 student 的 getName 方法，这也应当被注意，student.name 如何找到对应的 getter 方法，需要解决上一段中提到的同样的问题，建议不确定的地方多测试，尽量采取稳妥的写法。



可能有人会觉得这样的介绍类似于“茴”字有几种写法，但笔者认为恰恰是这些小的规范，容易被人忽视，才更加需要被注意。

