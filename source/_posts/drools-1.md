---
title: drools 用户指南 ----stateless session（无状态会话）的使用
date: 2017-04-11 12:51:59
tags: 
- 规则引擎
- drools
categories: 
- 规则引擎
---



## stateless session 无状态会话 ##

Drools 规则引擎中有如此多的用例和诸多功能，它变得令人难以置信。不过不用担心，复杂性是分层的，你可以用简单的用例来逐步了解 drools。

无状态会话，不使用推理，形成最简单的用例。无状态会话可以被称为函数传递一些数据，然后再接收一些结果。无状态会话的一些常见用例有以下但不限于：

1. 验证
  这个人有资格获得抵押吗？
2. 计算
  计算抵押保费。
3. 路由和过滤
  将传入的邮件（如电子邮件）过滤到文件夹中。
  将传入的邮件发送到目的地。

所以让我们从使用驾驶执照应用程序的一个非常简单的例子开始吧。

```java
public class Applicant {
    private String name;
    private int age;
    private boolean valid;
    // getter and setter methods here
}
```

现在我们有了我们的数据模型，我们可以写出我们的第一个规则。我们假设应用程序使用规则来拒绝不符合规则的申请。由于这是一个简单的验证用例，我们将添加一条规则来取消任何 18 岁以下的申请人的资格。

```java
package com.company.license

rule "Is of valid age"
when
    $a : Applicant(age < 18)
then
    $a.setValid(false);
end
```

<!-- more -->

为了使引擎了解数据，所以可以根据规则进行处理，我们必须插入数据，就像数据库一样。当申请人实例插入到引擎中时，将根据规则的约束进行评估，在这种情况下，这只是一个规则的两个约束条件。我们说两个，因为申请人类型是第一个对象类型约束，而 age <18 是第二个字段约束。对象类型约束及其零个或多个字段约束被称为模式。当插入的实例同时满足对象类型约束和所有字段约束时，它被称为匹配。`$a` 是一个绑定变量，它允许我们引用匹配的对象。其属性可以更新。美元字符（'$'）是可选的，但它有助于区分变量名称和字段名称。匹配模式与插入数据的过程并不奇怪，通常被称为模式匹配。

要使用这个规则，有必要把它放在一个 Drools 文件中，只是一个带有.drl 扩展名的纯文本文件，简称为“Drools Rule Language”。我们来调用 `licenseApplication.drl` 这个文件，并将其存储在 Kie Project 中。 Kie 项目具有正常的 Maven 项目的结构，并附加一个可以创建的 `KieBase` 和 `KieSession` 文件（kmodule.xml）。该文件必须放在 Maven 项目的 `resources/META-INF` 文件夹中，而所有其他 Drools 工件（如包含前一规则的 `licenseApplication.drl`）必须存储在资源文件夹或其下的任何其他子文件夹中。

由于为所有配置方面提供了有意义的默认值，所以最简单的 kmodule.xml 文件只能包含一个空的 kmodule 标签，如下所示：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kmodule xmlns="http://www.drools.org/xsd/kmodule"/>
```

此时，可以从类路径创建一个 KieContainer 来读取要构建的文件。

```java
KieServices kieServices = KieServices.Factory.get();
KieContainer kContainer = kieServices.getKieClasspathContainer();
```

上面的代码段编译了类路径中找到的所有 DRL 文件，并将该编译结果 `KieModule` 放在 `KieContainer` 中。如果没有错误，我们现在可以从 `KieContainer` 创建我们的会话并执行一些数据：

```java
StatelessKieSession kSession = kContainer.newStatelessKieSession();
Applicant applicant = new Applicant("Mr John Smith", 16);
assertTrue(applicant.isValid() );
ksession.execute(applicant);
assertFalse(applicant.isValid() );
```

上述代码根据规则执行数据。由于申请人年龄未满 18 岁，申请被标记为无效。

到目前为止，我们只使用了一个实例，但是如果我们想要使用多个实例呢？我们可以执行任何实现 Iterable 的对象，如集合。我们再添加一个名为 Application 的类，它有应用程序的日期，我们还将布尔有效字段移到 Application 类。

```java
public class Applicant {
    private String name;
    private int age;
    // getter and setter methods here
}

public class Application {
    private Date dateApplied;
    private boolean valid;
    // getter and setter methods here
}
```

我们还将添加另一条规则来验证申请是否在一段时间内进行。

```java
package com.company.license

rule "Is of valid age"
when
    Applicant(age < 18)
    $a : Application()     
then
    $a.setValid(false);
end

rule "Application was made this year"
when
    $a : Application(dateApplied > "01-jan-2009")     
then
    $a.setValid(false);
end
```

不幸的是，Java 数组不实现 Iterable 接口，所以我们必须使用 JDK 转换器方法 Arrays.asList（...）。下面显示的代码针对一个可迭代列表执行，其中在触发任何匹配的规则之前插入所有集合元素。

```java
StatelessKieSession kSession = kContainer.newStatelessKieSession();
Applicant applicant = new Applicant("Mr John Smith", 16);
Application application = new Application();
assertTrue(application.isValid() );
ksession.execute(Arrays.asList( new Object[] {application, applicant} ) );
assertFalse(application.isValid() );
```

执行的两个执行方法（Object object）和 execute（Iterable 对象）实际上是接口 BatchExecutor 的方法 execute（Command 命令）的便利方法。

KieCommands 命令工厂可以像 KIE A​​PI 的所有其他工厂一样从 KieServices 获取，用于创建命令，以便以下操作相当于执行（Iterable it）：

```java
ksession.execute(kieServices.getCommands().newInsertElements(Arrays.asList( new Object[] {application, applicant} ) );
```

批处理执行器和命令工厂在使用多个命令和输出标识符以获取结果时特别有用。
```java
KieCommands kieCommands = kieServices.getCommands();
List<Command> cmds = new ArrayList<Command>();
cmds.add(kieCommands.newInsert( new Person( "Mr John Smith"), "mrSmith", true, null ) );
cmds.add(kieCommands.newInsert( new Person( "Mr John Doe"), "mrDoe", true, null ) );
BatchExecutionResults results = ksession.execute(kieCommands.newBatchExecution( cmds) );
assertEquals(new Person( "Mr John Smith"), results.getValue("mrSmith") );
```

