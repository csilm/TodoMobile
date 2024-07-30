from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets, permissions
from .serializers import TaskSerializer
from .models import Task

class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    permission_classes = [permissions.AllowAny]  # Replace with appropriate permissions
