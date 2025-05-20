---
title: Arthas | 追踪线上耗时方法
date: 2020-04-09 20:49:30
tags:
- Arthas
categories:
- Arthas
toc: true
---

## 前言

本文是 Arthas 系列文章的第三篇。

本文主要介绍 `trace` 指令，用于定位两种类型的问题：

1. 线上服务 RT 比较高，但没有打印日志，无法确定具体是哪个方法比较耗时
2. 线上服务出现异常，需要追踪到方法的堆栈

<!-- more -->

## 模拟线上耗时方法



## 总结

本文以 Dubbo 线程池满异常作为引子，介绍了线程类问题该如何分析，以及如何通过 Arthas 快速诊断线程问题。有了 Arthas，基本不再需要 jstack 将 16 进制转来转去了，大大提升了诊断速度。

## Arthas 钉钉交流群

![_images/dingding_qr.jpg](https://alibaba.github.io/arthas/_images/dingding_qr.jpg)
