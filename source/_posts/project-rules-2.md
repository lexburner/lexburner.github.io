---
title: 警惕不规范的变量命名
date: 2017-09-23 13:45:56
tags:
- JAVA
- 技术杂谈
categories:
- 技术杂谈
---

就在最近，项目组开始强调开发规范了，今天分享一个变量名命名不规范的小案例，强调一下规范的重要性。例子虽小，但却比较有启发意义。

## Boolean变量名命名规范

16年底，阿里公开了《Java开发规范手册》，其中有一条便是“布尔类型不能以is为前缀”。规范中没有举出例子，但是给出了原因：会导致部分序列化框架的无法解析。

看看错误的示范，会导致什么问题，以Spring中的jdbcTemplate来进行实验。

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

其中，isSuccess使用的是包装类型Boolean，而isSend使用的是原生类型boolean，而getter，setter方法是使用Intellij IDEA自动生成的，布尔类型生成getter，setter方法时略微特殊，比如原生类型的getter方式是以is开头的，他们略微有点区别，注意区分。生成getter，setter方法之后，其实已经有点奇怪了，不急，继续下面的实验。

在数据库中，isSuccess被映射了is_success，isSend被映射成了is_send，这符合我们的预期。并且为了后续的实验，我们事先准备一条记录，用于后续的查询，在mysql的方言中，布尔类型被默认自动映射成byte，1代表ture，0代表false。

| id   | is_success | is_send |
| ---- | ---------- | ------- |
| 1    | 1          | 1       |

### 使用JdbcTemplate查询

```java
public void test(String id) {
    RowMapper<Bar> barRowMapper = new BeanPropertyRowMapper<Bar>(Bar.class);
    Bar bar = jdbcTemplate.queryForObject("select * from bar where id = ?", new Object[]{id}, barRowMapper);
    System.out.println(bar);
}
```

JdbcTemplate提供了BeanPropertyRowMapper完成数据库到实体类的映射，事先我重写了Bar类的toString方法，调用`test(1)`看看是否能成功映射。结果如下：

```java
Bar{id=1, isSuccess=null, isSend=false}
```

数据库中是实际存在这样的字段，并且值都是true，而使用JdbcTemplate，却查询不到这样的问题，这边是不遵循规范导致的问题。

相信这个例子可以让大家更加加深映像，特别是在维护老旧代码时，如果发现有is开头的boolean值，需要额外地注意。

## 包装类型与原生类型

在回顾一下上述的demo，原生类型和包装类型都没有封装成功，isSuccess得到了一个null值，isSend得到了一个false值。后者足够引起我们的警惕，如果说前者会引起一个NullPointerExcepiton导致程序异常，还可以引起开发者的注意，而后者很有可能一直作为一个隐藏的bug，不被人所察觉，因为boolean的默认值为false。

在类变量中，也普遍提倡使用包装类型，而原生类型的不足之处是很明显的。以Integer num;字段为例，num=null代表的含义是num字段未被保存，未定义；而num=0代表的含义是明确的，数量为0。原生类型的表达能力有限。所以提倡在局部作用域的计算中使用原生类型，而在类变量中使用包装类型。

## JavaBean规范

如今的微服务的时代，都是在聊架构，聊容器编排，竟然还有人聊JavaBean，但既然说到了规范，顺带提下。

先来做个选择题，以下选项中符合JavaBean命名规范的有哪些？：

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

怎么样，符合你的预想吗？JavaBean规范并不是像很多人想的那样，首字母小写，之后的每一个单词首字母大写这样的驼峰命名法。正确的命名规范应该是：要么前两个字母都是小写，要么前两个字母都是大写。因为英文单词中有URL，USA这样固定形式的大写词汇，所以才有了这样的规范。特别警惕B那种形式，一些诸如sNo，eBook,eMail,cId这样的命名，都是不规范的。

由此引申出了getter，setter命名的规范，除了第一节中Boolean类型的特例之外，网上还有不上文章，强调了这样的概念：eBook对应的getter，setter应当为geteBook(),seteBook()，即当类变量的首字母是小写，而第二个字母是大写时，生成的getter，setter应当是（get/set）+类变量名。但上面已经介绍过了，eBook这样的变量命名本身就是不规范的，在不规范的变量命名下强调规范的getter，setter命名，出发点就错了。有兴趣的朋友可以在eclipse，intellij idea中试试，这几种规范，不规范的变量命名，各自对应的getter，setter方法是如何的。另外需要知晓一点，IDE提供的自动生成getter，setter的机制，以及lombok这类框架的机制，都是由默认的设置，在与其他反射框架配合使用时，只有双方都遵循规范，才能够配合使用，而不能笃信框架。这一点上，有部分国产的框架做的并不是很好。

最后说一个和JavaBean相关的取值规范，在jsp的c标签，freemarker一类的模板语法，以及一些el表达式中，${student.name}并不是取的student的name字段，而是调用了student的getName方法，这也应当被注意，student.name如何找到对应的getter方法，需要解决上一段中提到的同样的问题，建议不确定的地方多测试，尽量采取稳妥的写法。



可能有人会觉得这样的介绍类似于“茴”字有几种写法，但笔者认为恰恰是这些小的规范，容易被人忽视，才更加需要被注意。

