from django.db import models

# Create your models here.
class Task(models.Model):
    title = models.CharField(max_length=200)
    completed = models.BooleanField(default=False)
    # Add more fields as needed (e.g., due_date, priority)
